import { renderWebsite } from '../demo/website'

const template = await Bun.file(new URL('../web/index.html', import.meta.url)).text()
const output = process.argv[2] ?? 'dist/quietsignal-demo.html'
await Bun.write(output, renderWebsite(template, Date.now()))
console.log(`Exported five fictional scenarios to ${output}`)
