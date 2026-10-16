import { describe, expect, test } from 'bun:test'
import { renderWebsite } from '../demo/website'

const now = 1_800_000_000_000
const template = await Bun.file(new URL('../web/index.html', import.meta.url)).text()

describe('standalone website data boundary', () => {
  test('fills an explicit JSON slot without changing executable JavaScript', () => {
    const output = renderWebsite(template, now)
    const scripts = (html: string) =>
      [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    expect(scripts(output)).toEqual(scripts(template))
    const data = JSON.parse(
      /<script id="demo-scenarios" type="application\/json">([\s\S]*?)<\/script>/.exec(output)![1]!
    )
    expect(Object.keys(data)).toHaveLength(5)
    expect(data.correlated.evidenceBriefs).toHaveLength(1)
    for (const privateField of ['organizationId', 'collectorId', 'eventId', 'privateFindings'])
      expect(JSON.stringify(data)).not.toContain(privateField)
    expect(output).not.toContain('href="/app"')
  })
  test('accepts attribute formatting changes and rejects missing or duplicated slots', () => {
    const reformatted = template.replace(
      'id="demo-scenarios" type="application/json"',
      "type='application/json'\n id='demo-scenarios'"
    )
    expect(renderWebsite(reformatted, now)).toContain('offline-synthetic-demo')
    expect(() => renderWebsite(template.replace('id="demo-scenarios"', 'id="wrong"'), now)).toThrow(
      'exactly one'
    )
    expect(() =>
      renderWebsite(template + '<script id="demo-scenarios">null</script>', now)
    ).toThrow('exactly one')
  })
})
