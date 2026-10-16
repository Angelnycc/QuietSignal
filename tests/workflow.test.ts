import { policy } from '../correlation/defaults'
import { describe, expect, test } from 'bun:test'
import { configSchema, initWorkflow, onCronTrigger } from '../correlation/workflow'
import { fixture } from '../demo/fixtures'

const now = 1_800_000_000_000
const config = () =>
  configSchema.parse({
    mode: 'local-simulation',
    schedule: '0 */5 * * * *',
    snapshotUrl: 'http://127.0.0.1:8787/fixtures/snapshot',
    policy,
  })

function mockRuntime(body = JSON.stringify(fixture('correlated', now)), statusCode = 200) {
  const released: string[] = []
  let crossovers = 0
  const runtime = {
    config: config(),
    now: () => new Date(now),
    callCapability: () => ({
      result: () => ({ statusCode, body: new TextEncoder().encode(body) }),
    }),
    usingTheDons: () => {
      crossovers++
      return { log: (value: string) => released.push(value) }
    },
  }
  return {
    runtime: runtime as unknown as Parameters<typeof onCronTrigger>[0],
    released,
    crossovers: () => crossovers,
  }
}

describe('confidential handler contract (mock runtime, not a TEE)', () => {
  test('the only released data is the approved aggregate summary', () => {
    const m = mockRuntime()
    const output = onCronTrigger(m.runtime)
    expect(JSON.parse(output).status).toBe('corroborated-pattern')
    expect(m.released).toEqual([output])
    for (const value of ['demo-alpha', 'collector-', 'supplier-incident', 'privateFindings']) {
      expect(output).not.toContain(value)
    }
    expect(m.crossovers()).toBe(1)
  })
  test('upstream errors release no payload or summary', () => {
    const m = mockRuntime('private upstream response', 401)
    expect(() => onCronTrigger(m.runtime)).toThrow('Evidence source request failed')
    expect(m.crossovers()).toBe(0)
    expect(m.released).toEqual([])
  })
  test('malformed JSON does not appear in errors', () => {
    const m = mockRuntime('private invalid JSON')
    expect(() => onCronTrigger(m.runtime)).toThrow('Evidence source returned invalid JSON')
    expect(m.crossovers()).toBe(0)
  })
  test('validation errors do not export raw field contents', () => {
    const m = mockRuntime(JSON.stringify({ organizationId: 'private-company' }))
    expect(() => onCronTrigger(m.runtime)).toThrow('Evidence or policy validation failed')
    expect(m.crossovers()).toBe(0)
  })
  test('oversized responses are rejected before parsing', () => {
    const m = mockRuntime('a'.repeat(262_145))
    expect(() => onCronTrigger(m.runtime)).toThrow('Evidence response exceeds prototype limit')
    expect(m.crossovers()).toBe(0)
  })
  test('registers an enclave-constrained handler', () => {
    const handlers = initWorkflow(config())
    expect(handlers).toHaveLength(1)
    expect(handlers[0]!.fn).toBe(onCronTrigger)
    expect(handlers[0]!.requirements).toBeDefined()
  })
  test('rejects production mode, arbitrary sources, and five-field schedules', () => {
    expect(() => configSchema.parse({ ...config(), mode: 'production' })).toThrow()
    expect(() =>
      configSchema.parse({ ...config(), snapshotUrl: 'https://other.example/data' })
    ).toThrow()
    expect(() => configSchema.parse({ ...config(), schedule: '*/5 * * * *' })).toThrow()
  })
})
