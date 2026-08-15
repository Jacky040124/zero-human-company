import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

// Render-injected variables and explicit test process.env values keep priority.
// Local API, CLI, Workflow, and Band worker entrypoints share this one file.
loadDotenv({ path: join(repositoryRoot, '.env.local') })
