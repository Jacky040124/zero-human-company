import OpenAI from 'openai'
import { describe, expect, it, vi } from 'vitest'
import { ProviderOutcomeUnknownError } from './types.js'
import {
  OPENROUTER_BASE_URL,
  OPENROUTER_OUTREACH_MODEL,
  OpenRouterSalesProvider,
} from './openai.js'

const request = {
  demoRunId: 'demo-1',
  idempotencyKey: 'outreach-1',
  payload: {
    company: 'Nordlicht Import GmbH',
    rolePlayerName: 'Demo Buyer',
    product: 'Dining furniture',
    evidence: ['FSC Mix documentation available'],
    objective: 'Invite the consenting role-player to discuss a pilot',
  },
}

describe('OpenRouter sales outreach', () => {
  it('uses the routed GPT-5.6 Luna model and returns the parsed structured draft', async () => {
    const draft = {
      subject: 'Pilot discussion',
      body: 'Would you be open to discussing a furniture pilot?',
      claims: ['FSC Mix documentation available'],
      needsHumanReview: false,
      reviewReason: null,
    }
    const fetchOpenRouter = vi.fn(async () => new Response(JSON.stringify({
      id: 'gen-openrouter-1',
      object: 'chat.completion',
      created: 1,
      model: OPENROUTER_OUTREACH_MODEL,
      choices: [{
        index: 0,
        finish_reason: 'stop',
        logprobs: null,
        message: { role: 'assistant', content: JSON.stringify(draft), refusal: null },
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = new OpenAI({
      apiKey: 'openrouter-secret',
      baseURL: OPENROUTER_BASE_URL,
      fetch: fetchOpenRouter as typeof fetch,
    })
    const provider = new OpenRouterSalesProvider(
      'openrouter-secret',
      OPENROUTER_OUTREACH_MODEL,
      OPENROUTER_BASE_URL,
      client,
    )

    const result = await provider.execute(request)

    expect(fetchOpenRouter).toHaveBeenCalledOnce()
    const [url, init] = fetchOpenRouter.mock.calls[0]!
    expect(String(url)).toBe(`${OPENROUTER_BASE_URL}/chat/completions`)
    const body = JSON.parse(String(init?.body))
    expect(body).toEqual(expect.objectContaining({
      model: OPENROUTER_OUTREACH_MODEL,
      reasoning_effort: 'medium',
      provider: { require_parameters: true },
      response_format: expect.objectContaining({ type: 'json_schema' }),
    }))
    expect(result).toMatchObject({
      provider: 'OPENAI',
      externalId: 'gen-openrouter-1',
      data: draft,
      redacted: {
        router: 'OPENROUTER',
        model: OPENROUTER_OUTREACH_MODEL,
      },
    })
  })

  it('rejects a missing OpenRouter key and configuration drift', () => {
    expect(() => new OpenRouterSalesProvider(undefined)).toThrow('OPENROUTER_API_KEY')
    expect(() => new OpenRouterSalesProvider('key', 'openai/other-model')).toThrow(OPENROUTER_OUTREACH_MODEL)
    expect(() => new OpenRouterSalesProvider(
      'key',
      OPENROUTER_OUTREACH_MODEL,
      'https://example.com/v1',
    )).toThrow(OPENROUTER_BASE_URL)
  })

  it('fails closed when the SDK cannot determine whether the paid request completed', async () => {
    const fetchOpenRouter = vi.fn(async () => {
      throw new TypeError('network timeout after request upload')
    })
    const client = new OpenAI({
      apiKey: 'openrouter-secret',
      baseURL: OPENROUTER_BASE_URL,
      fetch: fetchOpenRouter as typeof fetch,
      maxRetries: 0,
    })
    const provider = new OpenRouterSalesProvider(
      'openrouter-secret',
      OPENROUTER_OUTREACH_MODEL,
      OPENROUTER_BASE_URL,
      client,
    )

    await expect(provider.execute(request)).rejects.toMatchObject({
      name: 'ProviderOutcomeUnknownError',
      message: expect.stringContaining('automatic retry is disabled'),
    })
    expect(fetchOpenRouter).toHaveBeenCalledOnce()
    expect(provider.capabilities().idempotency).toBe('manual')
    expect(provider.reconcile).toBeUndefined()
  })

  it('fails closed with the accepted response ID when the paid response is malformed', async () => {
    const fetchOpenRouter = vi.fn(async () => new Response(JSON.stringify({
      id: 'gen-malformed-1',
      object: 'chat.completion',
      created: 1,
      model: OPENROUTER_OUTREACH_MODEL,
      choices: [{
        index: 0,
        finish_reason: 'stop',
        logprobs: null,
        message: { role: 'assistant', content: '{"subject":', refusal: null },
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = new OpenAI({
      apiKey: 'openrouter-secret',
      baseURL: OPENROUTER_BASE_URL,
      fetch: fetchOpenRouter as typeof fetch,
      maxRetries: 0,
    })
    const provider = new OpenRouterSalesProvider(
      'openrouter-secret',
      OPENROUTER_OUTREACH_MODEL,
      OPENROUTER_BASE_URL,
      client,
    )

    const error = await provider.execute(request).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ProviderOutcomeUnknownError)
    expect(error).toMatchObject({ name: 'ProviderOutcomeUnknownError' })
    expect(fetchOpenRouter).toHaveBeenCalledOnce()
    expect(provider.reconcile).toBeUndefined()
  })
})
