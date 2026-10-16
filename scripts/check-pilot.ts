import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { PilotApi } from '../app/api'
import { PilotStore } from '../app/store'
import { createLocalServer } from '../app/http'
import { randomToken } from '../app/security'

// Browser tests own a disposable workspace; never read development credentials.
const folder = mkdtempSync(join(tmpdir(), 'quietsignal-browser-'))
const store = new PilotStore(join(folder, 'test.sqlite'))
const token = randomToken()
const accessFile = join(folder, 'test-access.json')
const seeds = ['alpha', 'bravo', 'charlie'].map((name) => {
  const pair = generateKeyPairSync('ed25519')
  return {
    id: 'collector-' + name,
    organizationId: 'demo-' + name,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  }
})
const options = { origin: 'http://127.0.0.1:0', bootstrapToken: token, seeds }
const api = new PilotApi(store, options)
const server = createLocalServer({ api })
options.origin = 'http://127.0.0.1:' + server.port
await Bun.write(
  accessFile,
  JSON.stringify({ kind: 'quietsignal-local-access/v1', accessToken: token }),
  { mode: 0o600 }
)
try {
  const child = Bun.spawn(
    ['python3', resolve('scripts/check-pilot.py'), options.origin, accessFile, folder],
    { stdout: 'inherit', stderr: 'inherit' }
  )
  const status = await child.exited
  if (status !== 0) process.exitCode = status
} finally {
  server.stop(true)
  store.close()
  rmSync(folder, { recursive: true, force: true })
}
