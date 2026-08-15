import Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'
import { ProviderOutcomeUnknownError } from '../types.js'
import {
  PILOT_CURRENCY,
  PILOT_PRICE_CENTS,
  StripeCheckoutProvider,
  verifyStripeCheckoutCompleted,
} from './index.js'

const config = {
  secretKey: 'sk_test_example',
  webhookSecret: 'whsec_example',
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
  mode: 'TEST' as const,
}

describe('StripeCheckoutProvider', () => {
  it('creates an exact sandbox five-dollar checkout with metadata and idempotency', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      livemode: false,
      status: 'open',
    })
    const provider = new StripeCheckoutProvider(config, {
      checkout: { sessions: { create } },
      webhooks: {},
    } as never)

    const result = await provider.execute({
      demoRunId: 'run_1',
      idempotencyKey: 'idem_1',
      payload: { pilotActivationId: 'pilot_1' },
    })

    expect(create).toHaveBeenCalledOnce()
    const [params, options] = create.mock.calls[0]!
    expect(params).toMatchObject({
      mode: 'payment',
      client_reference_id: 'pilot_1',
      metadata: { demoRunId: 'run_1', pilotActivationId: 'pilot_1' },
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: 500 } }],
    })
    expect(options).toEqual({ idempotencyKey: 'idem_1' })
    expect(result.data.checkoutSessionId).toBe('cs_test_123')
  })

  it('marks an ambiguous creation failure as outcome unknown', async () => {
    const provider = new StripeCheckoutProvider(config, {
      checkout: { sessions: { create: vi.fn().mockRejectedValue(new Error('socket closed')) } },
      webhooks: {},
    } as never)

    await expect(
      provider.execute({
        demoRunId: 'run_1',
        idempotencyKey: 'idem_1',
        payload: { pilotActivationId: 'pilot_1' },
      }),
    ).rejects.toBeInstanceOf(ProviderOutcomeUnknownError)
  })

  it('allows localhost return URLs only for sandbox mode', async () => {
    const provider = new StripeCheckoutProvider({
      ...config,
      successUrl: 'http://localhost:5173/success',
      cancelUrl: 'http://127.0.0.1:5173/cancel',
    }, {
      checkout: { sessions: { create: vi.fn() } },
      webhooks: {},
    } as never)

    await expect(provider.preflight()).resolves.toBeUndefined()
  })

  it.each([
    'http://checkout.stripe.com/c/pay/cs_test_123',
    'https://checkout.stripe.com.evil.example/c/pay/cs_test_123',
    'https://evil.example/c/pay/cs_test_123',
    'javascript:alert(1)',
    'data:text/html,malicious',
    'file:///etc/passwd',
    'blob:https://checkout.stripe.com/id',
    '//checkout.stripe.com/c/pay/cs_test_123',
  ])('rejects an unsafe Stripe checkout session URL: %s', async (url) => {
    const provider = new StripeCheckoutProvider(config, {
      checkout: { sessions: { create: vi.fn().mockResolvedValue({
        id: 'cs_test_123',
        url,
        livemode: false,
        status: 'open',
      }) } },
      webhooks: {},
    } as never)

    await expect(provider.execute({
      demoRunId: 'run_1',
      idempotencyKey: 'idem_1',
      payload: { pilotActivationId: 'pilot_1' },
    })).rejects.toBeInstanceOf(ProviderOutcomeUnknownError)
  })
})

describe('verifyStripeCheckoutCompleted', () => {
  const secret = 'whsec_test_secret'
  const stripe = new Stripe('sk_test_example')

  function signedEvent(overrides: Record<string, unknown> = {}) {
    const payload = JSON.stringify({
      id: 'evt_test_1',
      object: 'event',
      type: 'checkout.session.completed',
      livemode: false,
      api_version: '2025-12-15.clover',
      created: 1_700_000_000,
      pending_webhooks: 1,
      request: null,
      data: {
        object: {
          id: 'cs_test_1',
          object: 'checkout.session',
          livemode: false,
          amount_total: PILOT_PRICE_CENTS,
          currency: PILOT_CURRENCY,
          payment_status: 'paid',
          client_reference_id: 'pilot_1',
          payment_intent: 'pi_test_1',
          metadata: { demoRunId: 'run_1', pilotActivationId: 'pilot_1' },
          ...overrides,
        },
      },
    })
    return {
      payload,
      signature: stripe.webhooks.generateTestHeaderString({ payload, secret }),
    }
  }

  it('verifies and normalizes a signed sandbox completion', () => {
    const event = signedEvent()
    expect(
      verifyStripeCheckoutCompleted(stripe, event.payload, event.signature, secret, {
        demoRunId: 'run_1',
        pilotActivationId: 'pilot_1',
      }),
    ).toEqual({
      stripeEventId: 'evt_test_1',
      checkoutSessionId: 'cs_test_1',
      paymentIntentId: 'pi_test_1',
      demoRunId: 'run_1',
      pilotActivationId: 'pilot_1',
      livemode: false,
      providerMode: 'TEST',
      amount: 500,
      currency: 'usd',
    })
  })

  it.each([
    ['wrong amount', { amount_total: 499 }],
    ['wrong currency', { currency: 'cad' }],
    ['wrong mode session', { livemode: true }],
    ['mismatched metadata', { metadata: { demoRunId: 'other', pilotActivationId: 'pilot_1' } }],
  ])('rejects %s', (_name, overrides) => {
    const event = signedEvent(overrides)
    expect(() =>
      verifyStripeCheckoutCompleted(stripe, event.payload, event.signature, secret, {
        demoRunId: 'run_1',
        pilotActivationId: 'pilot_1',
      }),
    ).toThrow()
  })

  it('rejects an invalid signature before parsing proof', () => {
    const event = signedEvent()
    expect(() =>
      verifyStripeCheckoutCompleted(stripe, event.payload, 'bad', secret, {
        demoRunId: 'run_1',
        pilotActivationId: 'pilot_1',
      }),
    ).toThrow()
  })
})
