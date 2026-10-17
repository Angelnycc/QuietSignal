import { renderWebsite } from '../demo/website'

const template = await Bun.file(new URL('../web/index.html', import.meta.url)).text()
const output = process.argv[2] ?? 'dist/quietsignal-demo.html'
// Hash the final inline code so static hosting needs no unsafe-inline scripts.
const { createHash } = await import('node:crypto')
const rendered = renderWebsite(template, Date.now())
const scriptHashes = [...rendered.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((match) => "'sha256-" + createHash('sha256').update(match[1]!).digest('base64') + "'")
  .join(' ')
const csp =
  "default-src 'none'; script-src " +
  scriptHashes +
  "; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
await Bun.write(
  output,
  rendered.replace(
    '</head>',
    '<meta http-equiv="Content-Security-Policy" content="' + csp + '" /></head>'
  )
)
console.log(`Exported five fictional scenarios to ${output}`)
