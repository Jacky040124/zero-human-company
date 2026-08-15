import Stripe from 'stripe'
import type {
  ProviderCapabilities,
  ProviderPort,
  ProviderRequest,
  ProviderResult,
} from '../types.js'
import {
  ProviderConfigurationError,
  ProviderOutcomeUnknownError,
  sanitizedExternalId,
} from '../types.js'

export const PILOT_PRICE_CENTS = 500
export const PILOT_CURRENCY = 'usd'

export type StripeCheckoutRequest = {
  pilotActivationId: string
}

export type StripeCheckoutResult = {
  checkoutUrl: string
  checkoutSessionId: string
}

export type StripeCheckoutConfig = {
  secretKey: string
  webhookSecret: string
  successUrl: string
  cancelUrl: string
  mode: StripeProviderMode
}

export type StripeProviderMode = 'TEST' | 'LIVE'

type StripeClient = Pick<Stripe, 'checkout' | 'webhooks'>

export class StripeCheckoutProvider
  implements ProviderPort<StripeCheckoutRequest, StripeCheckoutResult>
{
  readonly provider = 'STRIPE' as const
  private readonly stripe: StripeClient

  constructor(
    private readonly config: StripeCheckoutConfig,
    stripe?: StripeClient,
  ) {
    this.stripe = stripe ?? new Stripe(config.secretKey)
  }

  capabilities(): ProviderCapabilities {
    return { live: true, idempotency: 'native', operations: ['checkout.session.create'] }
  }

  async preflight(): Promise<void> {
    const missing = Object.entries(this.config)
      .filter(([, value]) => !value)
      .map(([key]) => key)
    if (missing.length) throw new ProviderConfigurationError(this.provider, missing)
    const expectedPrefix = this.config.mode === 'TEST' ? 'sk_test_' : 'sk_live_'
    if (!this.config.secretKey.startsWith(expectedPrefix)) {
      throw new ProviderConfigurationError(this.provider, [`secretKey (must be a ${this.config.mode.toLowerCase()} key)`])
    }
    if (!this.config.webhookSecret.startsWith('whsec_')) {
      throw new ProviderConfigurationError(this.provider, ['webhookSecret'])
    }
    for (const [name, value] of [
      ['successUrl', this.config.successUrl],
      ['cancelUrl', this.config.cancelUrl],
    ] as const) {
      const url = new URL(value)
      const localSandboxUrl = this.config.mode === 'TEST' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
      if (url.protocol !== 'https:' && !localSandboxUrl) {
        throw new ProviderConfigurationError(this.provider, [`${name} (must use https outside local Stripe test mode)`])
      }
    }
  }

  async execute(
    request: ProviderRequest<StripeCheckoutRequest>,
  ): Promise<ProviderResult<StripeCheckoutResult>> {
    await this.preflight()
    const { pilotActivationId } = request.payload
    if (!pilotActivationId || !request.demoRunId || !request.idempotencyKey) {
      throw new Error('Stripe checkout requires demoRunId, pilotActivationId, and idempotencyKey')
    }

    let session: Stripe.Checkout.Session
    try {
      session = await this.stripe.checkout.sessions.create(
        {
          mode: 'payment',
          client_reference_id: pilotActivationId,
          success_url: this.config.successUrl,
          cancel_url: this.config.cancelUrl,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: PILOT_CURRENCY,
                unit_amount: PILOT_PRICE_CENTS,
                product_data: { name: 'Zero Human Company pilot activation' },
              },
            },
          ],
          metadata: {
            demoRunId: request.demoRunId,
            pilotActivationId,
          },
          payment_intent_data: {
            metadata: {
              demoRunId: request.demoRunId,
              pilotActivationId,
            },
          },
        },
        { idempotencyKey: request.idempotencyKey },
      )
    } catch (error) {
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError ||
        error instanceof Stripe.errors.StripeAuthenticationError ||
        error instanceof Stripe.errors.StripePermissionError
      ) {
        throw error
      }
      throw new ProviderOutcomeUnknownError(
        'Stripe checkout creation outcome is unknown; reconcile or retry with the same idempotency key',
        request.idempotencyKey,
      )
    }

    const expectedLivemode = this.config.mode === 'LIVE'
    if (session.livemode !== expectedLivemode || !session.id || !session.url) {
      throw new ProviderOutcomeUnknownError(
        `Stripe returned an incomplete or wrong-mode checkout session; expected ${this.config.mode}`,
        session.id,
      )
    }

    const externalId = sanitizedExternalId(this.provider, session.id)
    return {
      provider: this.provider,
      externalId,
      live: true,
      status: session.status ?? 'open',
      data: { checkoutUrl: session.url, checkoutSessionId: session.id },
      redacted: {
        externalId,
        amount: PILOT_PRICE_CENTS,
        currency: PILOT_CURRENCY,
        providerMode: this.config.mode,
        demoRunId: request.demoRunId,
        pilotActivationId,
      },
    }
  }
}

export type VerifiedStripeCheckout = {
  stripeEventId: string
  checkoutSessionId: string
  paymentIntentId: string | null
  demoRunId: string
  pilotActivationId: string
  livemode: boolean
  providerMode: StripeProviderMode
  amount: 500
  currency: 'usd'
}

export function verifyStripeCheckoutCompleted(
  stripe: Pick<Stripe, 'webhooks'>,
  rawBody: Buffer | string,
  signature: string,
  webhookSecret: string,
  expected: { demoRunId: string; pilotActivationId: string },
  expectedMode: StripeProviderMode = 'TEST',
): VerifiedStripeCheckout {
  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  const expectedLivemode = expectedMode === 'LIVE'
  if (event.type !== 'checkout.session.completed' || event.livemode !== expectedLivemode) {
    throw new Error(`Expected a ${expectedMode.toLowerCase()} checkout.session.completed event`)
  }

  const session = event.data.object
  const demoRunId = session.metadata?.demoRunId
  const pilotActivationId = session.metadata?.pilotActivationId
  if (
    session.livemode !== expectedLivemode ||
    session.amount_total !== PILOT_PRICE_CENTS ||
    session.currency?.toLowerCase() !== PILOT_CURRENCY ||
    session.payment_status !== 'paid' ||
    !demoRunId ||
    !pilotActivationId ||
    demoRunId !== expected.demoRunId ||
    pilotActivationId !== expected.pilotActivationId ||
    session.client_reference_id !== pilotActivationId
  ) {
    throw new Error(`Stripe checkout proof did not match the expected ${expectedMode.toLowerCase()} pilot payment`)
  }

  return {
    stripeEventId: event.id,
    checkoutSessionId: session.id,
    paymentIntentId:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    demoRunId,
    pilotActivationId,
    livemode: session.livemode,
    providerMode: expectedMode,
    amount: PILOT_PRICE_CENTS,
    currency: PILOT_CURRENCY,
  }
}
