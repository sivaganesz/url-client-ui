/**
 * Prints what the Siva Workspace exposes, so src/lib/api.js can be mapped onto
 * real tools instead of guesses.
 *
 * Run: npm run discover            (human-readable summary)
 *      npm run discover -- --json  (full schemas, pipe to a file)
 *
 * Nothing is written anywhere and the key is never printed.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '..', '.env')
if (existsSync(envPath)) process.loadEnvFile(envPath)

const KEY = process.env.PERFOX_API_KEY ?? ''
const MCP_URL = process.env.PERFOX_MCP_URL ?? 'https://siva-workspace-api.perfox.ai/mcp'
const asJson = process.argv.includes('--json')

if (!KEY) {
  console.error('PERFOX_API_KEY is not set. Copy .env.example to .env and add the key.')
  process.exit(1)
}

async function rpc(method, params = {}) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)

  let payload = text
  if (text.includes('data:')) {
    const frames = text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim())
    payload = frames.at(-1) ?? '{}'
  }
  const parsed = JSON.parse(payload)
  if (parsed.error) throw new Error(parsed.error.message ?? 'MCP error')
  return parsed.result
}

try {
  const result = await rpc('tools/list')
  const tools = result?.tools ?? []

  if (asJson) {
    console.log(JSON.stringify(tools, null, 2))
  } else {
    console.log(`${tools.length} tools in this workspace:\n`)
    for (const t of tools) {
      const args = Object.keys(t.inputSchema?.properties ?? {})
      const required = new Set(t.inputSchema?.required ?? [])
      const sig = args.map((a) => (required.has(a) ? a : `${a}?`)).join(', ')
      console.log(`  ${t.name}(${sig})`)
      if (t.description) console.log(`      ${t.description.split('\n')[0].slice(0, 110)}`)
    }
    console.log('\nMap these onto the TOOL table in src/lib/api.js, then set MAPPED = true.')
  }
} catch (err) {
  console.error(`Discovery failed: ${err.message}`)
  process.exit(1)
}
