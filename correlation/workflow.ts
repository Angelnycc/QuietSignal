import { cre, ok, text, type TeeRuntime } from '@chainlink/cre-sdk'
import { z } from 'zod'
import { correlate, policySchema } from './model'

export const configSchema = z
  .object({
    mode: z.literal('local-simulation'),
    schedule: z
      .string()
      .refine((s) => s.trim().split(/\s+/).length === 6, 'CRE cron requires six fields'),
    snapshotUrl: z
      .string()
      .url()
      .refine((s) => {
        const u = new URL(s)
        return (
          u.protocol === 'http:' &&
          u.hostname === '127.0.0.1' &&
          u.port === '8787' &&
          u.pathname === '/fixtures/snapshot' &&
          !u.username &&
          !u.password &&
          !u.hash
        )
      }, 'This prototype accepts only its loopback synthetic fixture source'),
    policy: policySchema,
  })
  .strict()
type Config = z.infer<typeof configSchema>

export const onCronTrigger = (runtime: TeeRuntime<Config>): string => {
  const response = new cre.capabilities.HTTPClient()
    .sendRequest(runtime, {
      url: runtime.config.snapshotUrl,
      method: 'GET',
    })
    .result()
  if (!ok(response)) throw new Error('Evidence source request failed')
  if (response.body.length > 262_144) throw new Error('Evidence response exceeds prototype limit')
  let snapshot: unknown
  try {
    snapshot = JSON.parse(text(response))
  } catch {
    throw new Error('Evidence source returned invalid JSON')
  }
  let summary
  try {
    summary = correlate(snapshot, runtime.config.policy, runtime.now().getTime()).summary
  } catch {
    throw new Error('Evidence or policy validation failed')
  }
  // Deliberately redacted conclusion only. No raw observations or identities.
  const output = JSON.stringify(summary)
  runtime.usingTheDons().log(output)
  // Local mode has no report, EVM client, signer, or transaction path.
  return output
}

export function initWorkflow(config: Config) {
  return [
    cre.handlerInTee(
      new cre.capabilities.CronCapability().trigger({ schedule: config.schedule }),
      onCronTrigger,
      [{ tee: 'nitro', regions: ['us-west-2'] }]
    ),
  ]
}
