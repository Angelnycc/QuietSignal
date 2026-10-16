import { resolve } from 'node:path'
import { createLocalServer } from '../app/http'
import { openLocalPilot } from '../app/local'

const port = Number(process.env.QUIETSIGNAL_PORT ?? 8787)
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Choose an unprivileged local port')
const origin = 'http://127.0.0.1:' + port
const state = openLocalPilot(resolve(process.env.QUIETSIGNAL_STATE_DIR ?? '.quietsignal'), origin)
const server = createLocalServer(state)
console.log('QuietSignal website and controlled pilot ready on loopback port ' + server.port)
console.log(
  'Local operator access file: ' +
    state.accessPath +
    ' (private; never paste its contents into chat)'
)
console.log(
  'All collector simulations are fictional. No Chainlink credentials or deployments are used.'
)
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    server.stop(true)
    state.store.close()
    process.exit(0)
  })
