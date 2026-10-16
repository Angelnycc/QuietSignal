import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto'
import { chmodSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { observationSchema } from '../correlation/model'
import { publicKey, randomToken, signObservation } from '../app/security'

const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
const keySchema = z
  .object({
    kind: z.literal('quietsignal-test-collector/v1'),
    id,
    organizationId: id,
    publicKey: z.string(),
    privateKey: z.string(),
  })
  .strict()
const load = (path: string, maximum: number) => {
  if (statSync(path).size > maximum) throw new Error('Input file exceeds the permitted size')
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}
try {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'generate' && args.length === 3) {
    const [collectorId, organizationId, path] = args as [string, string, string]
    id.parse(collectorId)
    id.parse(organizationId)
    const pair = generateKeyPairSync('ed25519')
    const key = {
      kind: 'quietsignal-test-collector/v1',
      id: collectorId,
      organizationId,
      publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    }
    writeFileSync(resolve(path), JSON.stringify(key), { mode: 0o600, flag: 'wx' })
    chmodSync(resolve(path), 0o600)
    console.log('Private test collector material saved locally. Never upload or commit that file.')
    console.log(
      JSON.stringify(
        { id: key.id, organizationId: key.organizationId, publicKey: key.publicKey },
        null,
        2
      )
    )
  } else if (command === 'submit' && args.length === 5) {
    const [origin, workspaceId, runId, keyFile, observationFile] = args as [
      string,
      string,
      string,
      string,
      string,
    ]
    const url = new URL(origin)
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      throw new Error('This pilot collector can only send to a plain loopback HTTP origin')
    }
    z.string().uuid().parse(workspaceId)
    z.string().uuid().parse(runId)
    const key = keySchema.parse(load(keyFile, 8192))
    publicKey(key.publicKey)
    const privateKey = createPrivateKey(key.privateKey)
    if (
      privateKey.asymmetricKeyType !== 'ed25519' ||
      createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64') !==
        key.publicKey
    ) {
      throw new Error('Collector key pair is inconsistent')
    }
    const observation = observationSchema.parse(load(observationFile, 16_384))
    if (observation.organizationId !== key.organizationId || observation.collectorId !== key.id)
      throw new Error('Observation must match the collector scope')
    const body = JSON.stringify({
      schemaVersion: 'quietsignal-pilot/v1',
      synthetic: true,
      runId,
      observation,
    })
    const headers = signObservation(
      { workspaceId, collectorId: key.id, timestamp: String(Date.now()), nonce: randomToken() },
      body,
      privateKey
    )
    const response = await fetch(url.origin + '/api/pilot/observations', {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    const result = (await response.json()) as { status?: string; error?: { code?: string } }
    console.log(
      JSON.stringify({
        httpStatus: response.status,
        status: result.status ?? result.error?.code ?? 'unknown',
      })
    )
    if (!response.ok) process.exitCode = 1
  } else
    throw new Error(
      'Usage: collector generate <collector-id> <org-id> <private-file> | submit <loopback-origin> <workspace-id> <run-id> <private-file> <synthetic-observation-file>'
    )
} catch {
  // Parser/crypto exceptions can include supplied fields; do not echo them.
  console.error(
    'Collector command failed. Check arguments, file permissions, key scope and the local pilot guide.'
  )
  process.exitCode = 1
}
