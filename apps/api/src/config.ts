import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
loadDotenv({
  // Local development uses the root .env.local. Render-injected variables and
  // test process.env values still win because dotenv does not override them.
  path: [join(repositoryRoot, '.env.local'), join(repositoryRoot, '.env')],
})

const booleanFromEnv = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@localhost:5432/zero_human_company'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:5173'),
  PORT: z.coerce.number().int().positive().default(3001),
  COOKIE_SECRET: z.string().min(32).default('local-only-cookie-secret-change-me'),
  OWNER_EMAIL: z.string().email().default('owner@example.com'),
  OWNER_PASSWORD: z.string().min(8).default('local-owner-password'),
  JUDGE_MODE: booleanFromEnv,
  REAL_ACTIONS_ENABLED: booleanFromEnv,
  PROVIDER_MODE: z.enum(['fake', 'real']).default('fake'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.literal('gpt-5.6-luna').default('gpt-5.6-luna'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_MODE: z.enum(['TEST', 'LIVE']).default('TEST'),
  LINQ_API_BASE_URL: z.string().url().optional(),
  LINQ_API_KEY: z.string().optional(),
  LINQ_WEBHOOK_SECRET: z.string().optional(),
  LINQ_NORDLICHT_RECIPIENT: z.string().optional(),
  LINQ_MAAS_RECIPIENT: z.string().optional(),
  TERAC_TRANSPORT: z.enum(['http', 'mcp']).optional(),
  TERAC_API_BASE_URL: z.string().url().optional(),
  TERAC_API_KEY: z.string().optional(),
  TERAC_STUDY_PATH: z.string().optional(),
  TERAC_CONTRACT_REVIEW_PATH: z.string().optional(),
  BAND_REST_URL: z.string().url().default('https://app.band.ai'),
  BAND_WS_URL: z.string().url().default('wss://app.band.ai/api/v1/socket/websocket'),
  BAND_AGENT_BRAIN: z.enum(['CODEX', 'RESPONSES']).default('CODEX'),
  BAND_AGENT_ALLOW_RESPONSES_FALLBACK: booleanFromEnv,
  BAND_CODEX_THREAD_STATE_PATH: z.string().min(1).optional(),
  BAND_CODEX_WORKING_DIRECTORY: z.string().min(1).optional(),
  BAND_CODEX_RUNTIME_HOME: z.string().min(1).optional(),
  BAND_RESEARCHER_AGENT_ID: z.string().optional(),
  BAND_RESEARCHER_API_KEY: z.string().optional(),
  BAND_NEGOTIATOR_AGENT_ID: z.string().optional(),
  BAND_NEGOTIATOR_API_KEY: z.string().optional(),
  BAND_POLICY_AGENT_ID: z.string().optional(),
  BAND_POLICY_AGENT_API_KEY: z.string().optional(),
  DOCUMENSO_API_BASE_URL: z.string().url().default('https://app.documenso.com/api/v2'),
  DOCUMENSO_API_KEY: z.string().optional(),
  DOCUMENSO_TEMPLATE_ID: z.string().optional(),
  DOCUMENSO_WEBHOOK_SECRET: z.string().optional(),
  DOCUMENSO_CREATE_PATH: z.string().default('/envelope/use'),
  DOCUMENSO_RECONCILE_PATH: z.string().default('/envelope?externalId={externalId}'),
  DOCUMENSO_OWNER_RECIPIENT_ID: z.string().optional(),
  DOCUMENSO_BUYER_RECIPIENT_ID: z.string().optional(),
  DOCUMENSO_BUYER_EMAIL: z.string().email().optional(),
  MONID_API_BASE_URL: z.string().url().optional(),
  MONID_API_KEY: z.string().optional(),
  RENDER_API_KEY: z.string().optional(),
  RENDER_OWNER_ID: z.string().optional(),
  RENDER_WORKFLOW_ID: z.string().optional(),
  RENDER_WORKFLOW_SLUG: z.string().optional(),
})

export type AppConfig = z.infer<typeof configSchema>

let cached: AppConfig | undefined

export function getConfig(): AppConfig {
  cached ??= configSchema.parse(process.env)
  if (cached.JUDGE_MODE && (cached.PROVIDER_MODE !== 'real' || !cached.REAL_ACTIONS_ENABLED)) {
    throw new Error('JUDGE_MODE requires PROVIDER_MODE=real and REAL_ACTIONS_ENABLED=true')
  }
  return cached
}

export const judgeRequiredEnv = [
  'OPENAI_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'LINQ_API_BASE_URL',
  'LINQ_API_KEY',
  'LINQ_WEBHOOK_SECRET',
  'LINQ_NORDLICHT_RECIPIENT',
  'LINQ_MAAS_RECIPIENT',
  'TERAC_TRANSPORT',
  'TERAC_API_BASE_URL',
  'TERAC_API_KEY',
  'TERAC_STUDY_PATH',
  'TERAC_CONTRACT_REVIEW_PATH',
  'BAND_RESEARCHER_AGENT_ID',
  'BAND_RESEARCHER_API_KEY',
  'BAND_NEGOTIATOR_AGENT_ID',
  'BAND_NEGOTIATOR_API_KEY',
  'BAND_POLICY_AGENT_ID',
  'BAND_POLICY_AGENT_API_KEY',
  'BAND_AGENT_BRAIN',
  'DOCUMENSO_API_KEY',
  'DOCUMENSO_TEMPLATE_ID',
  'DOCUMENSO_WEBHOOK_SECRET',
  'DOCUMENSO_CREATE_PATH',
  'DOCUMENSO_RECONCILE_PATH',
  'DOCUMENSO_OWNER_RECIPIENT_ID',
  'DOCUMENSO_BUYER_RECIPIENT_ID',
  'DOCUMENSO_BUYER_EMAIL',
  'MONID_API_BASE_URL',
  'MONID_API_KEY',
  'RENDER_API_KEY',
  'RENDER_OWNER_ID',
  'RENDER_WORKFLOW_SLUG',
] as const

export function missingJudgeConfig(env: NodeJS.ProcessEnv = process.env): string[] {
  return judgeRequiredEnv.filter((key) => !env[key])
}
