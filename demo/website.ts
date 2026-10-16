import { scenarios } from './fixtures'
import { scenarioResult } from './scenarios'

/** Explicit HTML slots avoid rewriting executable JavaScript during export. */
export function renderWebsite(template: string, now: number): string {
  const dataSlot = /<script\b(?=[^>]*\bid=["']demo-scenarios["'])[^>]*>[\s\S]*?<\/script>/g
  const pilotLink = /<a\b(?=[^>]*\bdata-pilot-link\b)[^>]*>[\s\S]*?<\/a>/g
  if (
    [...template.matchAll(dataSlot)].length !== 1 ||
    [...template.matchAll(pilotLink)].length !== 1
  ) {
    throw new Error('Website must contain exactly one scenario-data slot and one pilot link')
  }
  const outputs = Object.fromEntries(
    scenarios.map((scenario) => [scenario, scenarioResult(scenario, now, true)])
  )
  const data = JSON.stringify(outputs).replace(/</g, '\\u003c')
  return template
    .replace(
      dataSlot,
      () => '<script id="demo-scenarios" type="application/json">' + data + '</script>'
    )
    .replace(pilotLink, '<a href="#architecture" data-pilot-link>Local pilot status</a>')
    .replace(
      'Synthetic local demonstration.',
      'Offline synthetic demonstration. Evidence times are fixed samples; no live monitoring or requests are performed.'
    )
}
