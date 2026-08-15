import { getConfig, missingJudgeConfig } from './config.js'
import { db } from './db.js'
import { createDemoRun, getDemoRunSnapshot, latestDemoRunId } from './domain/demo-service.js'
import { runFakeRehearsal } from './domain/fake-run.js'
import { verifyDemoRun } from './domain/verify.js'
import { createProviderRegistry, preflightProviders } from './providers/registry.js'

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const command = process.argv[2]
  if (command === 'seed') {
    const id = await createDemoRun(process.env.JUDGE_MODE === 'true' ? 'JUDGE' : 'FAKE')
    console.log(JSON.stringify({ demoRunId: id }))
    return
  }
  if (command === 'run') {
    if (process.env.JUDGE_MODE === 'true') throw new Error('demo:run will not fake a JUDGE_MODE run; trigger named real workflows instead')
    const id = await runFakeRehearsal(option('--run-id'))
    console.log(JSON.stringify(await getDemoRunSnapshot(id), null, 2))
    return
  }
  if (command === 'preflight') {
    const missing = missingJudgeConfig()
    const database = await db.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`
    const config = getConfig()
    let providers: Array<{ provider: string; live: boolean }> = []
    let providerError: string | null = null
    if (!missing.length) {
      try {
        providers = await preflightProviders(createProviderRegistry())
      } catch (error) {
        providerError = error instanceof Error ? error.message : 'Provider preflight failed'
      }
    }
    const allLive = providers.length > 0 && providers.every((item) => item.live)
    const report = { passed: missing.length === 0 && database.length === 1 && config.JUDGE_MODE && allLive && !providerError, judgeMode: config.JUDGE_MODE, database: database.length === 1, allProvidersLive: allLive, providers, missing, providerError }
    console.log(JSON.stringify(report, null, 2))
    if (!report.passed) process.exitCode = 1
    return
  }
  if (command === 'verify') {
    const id = option('--run-id') ?? await latestDemoRunId()
    if (!id) throw new Error('No demo run found; pass --run-id')
    const report = await verifyDemoRun(id)
    console.log(JSON.stringify(report, null, 2))
    if (!report.passed) process.exitCode = 1
    return
  }
  throw new Error('Usage: cli.ts seed|run|preflight|verify [--run-id ID]')
}

try {
  await main()
} finally {
  await db.$disconnect()
}
