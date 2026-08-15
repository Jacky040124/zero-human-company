import { buildApp } from './app.js'
import { getConfig } from './config.js'

const config = getConfig()
const app = await buildApp()

await app.listen({ port: config.PORT, host: '0.0.0.0' })

const shutdown = async () => {
  await app.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
