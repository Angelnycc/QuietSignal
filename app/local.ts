import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createPublicKey, generateKeyPairSync } from 'node:crypto'
import { join } from 'node:path'
import { PilotApi, type SeedCollector } from './api'
import { PilotStore } from './store'
import { randomToken } from './security'

/** Application-owned local test credentials. Never print or commit their values. */
export function openLocalPilot(stateDirectory: string, origin: string) {
  mkdirSync(stateDirectory, { recursive: true, mode: 0o700 })
  chmodSync(stateDirectory, 0o700)
  const accessPath = join(stateDirectory, 'operator-access.json')
  if (!existsSync(accessPath)) {
    writeFileSync(
      accessPath,
      JSON.stringify({
        kind: 'quietsignal-local-access/v1',
        role: 'operator',
        accessToken: randomToken(),
        notice: 'Local workspace access. Keep this file private. This is not a Chainlink API key.',
      }),
      { flag: 'wx', mode: 0o600 }
    )
  }
  chmodSync(accessPath, 0o600)
  const materialPath = join(stateDirectory, 'test-collector-material.json')
  if (!existsSync(materialPath)) {
    const seeds = ['alpha', 'bravo', 'charlie'].map((name) => {
      const pair = generateKeyPairSync('ed25519')
      return {
        id: 'collector-' + name,
        organizationId: 'demo-' + name,
        publicKey: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
        privateKey: pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      }
    })
    writeFileSync(materialPath, JSON.stringify(seeds), { flag: 'wx', mode: 0o600 })
  }
  chmodSync(materialPath, 0o600)
  const access = JSON.parse(readFileSync(accessPath, 'utf8')) as { accessToken: string }
  const seeds = JSON.parse(readFileSync(materialPath, 'utf8')) as SeedCollector[]
  for (const seed of seeds) {
    if (
      createPublicKey(seed.privateKey)
        .export({ format: 'der', type: 'spki' })
        .toString('base64') !== seed.publicKey
    ) {
      throw new Error('Local collector material is inconsistent')
    }
  }
  const databasePath = join(stateDirectory, 'pilot.sqlite')
  const store = new PilotStore(databasePath)
  try {
    chmodSync(databasePath, 0o600)
    for (const seed of seeds) {
      const registered = store.collector(seed.id)
      if (registered && registered.public_key !== seed.publicKey)
        throw new Error('Local collector material does not match the registry')
    }
    const api = new PilotApi(store, { origin, seeds, bootstrapToken: access.accessToken })
    return { api, store, accessPath }
  } catch (error) {
    store.close()
    throw error
  }
}
