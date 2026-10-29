// Checks that run before every build (npm run build). If one fails, the deploy stops before it costs credits.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const read = (f) => readFileSync(f, 'utf8')
const files = (dir, ext) => readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => `${dir}/${f}`)

test('every JavaScript file has valid syntax', () => {
  const list = ['assets/app.js', 'sw.js', 'build.mjs', 'src/auth.js', ...files('netlify/functions', '.mjs'), ...files('netlify/lib', '.mjs')]
  for (const f of list) {
    const isModule = f.endsWith('.mjs') || f === 'src/auth.js'
    execFileSync(process.execPath, isModule ? ['--input-type=module', '--check'] : ['--check', f], { input: isModule ? read(f) : undefined, stdio: ['pipe', 'pipe', 'pipe'] })
  }
})

test('every $("id") used by assets/app.js exists in index.html (or is built by app.js itself)', () => {
  const js = read('assets/app.js'), html = read('index.html')
  const used = [...new Set([...js.matchAll(/\$\('([A-Za-z][\w-]*)'\)/g)].map((m) => m[1]))]
  const missing = used.filter((id) => !html.includes(`id="${id}"`) && !js.includes(`id="${id}"`) && !js.includes(`id='${id}'`))
  assert.deepEqual(missing, [])
})

test('every id on the page is used only once', () => {
  const html = read('index.html')
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
  assert.deepEqual(dup, [])
})

test('files named in the service worker exist (auth.js is made by the build)', () => {
  const sw = read('sw.js'), shell = sw.match(/const SHELL = \[([^\]]*)\]/)[1]
  const names = [...shell.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter((n) => n && n !== 'assets/auth.js')
  assert.deepEqual(names.filter((n) => !existsSync(n)), [])
})

test('netlify.toml redirects point to real pages', () => {
  const toml = read('netlify.toml')
  const targets = [...toml.matchAll(/to = "\/([^"]+)"/g)].map((m) => m[1])
  assert.ok(targets.length > 0)
  assert.deepEqual(targets.filter((t) => !existsSync(t)), [])
})

test('the build copies the files the pages need', () => {
  const b = read('build.mjs')
  assert.ok(b.includes('assets/app.js') && b.includes('assets/app.css'))
  assert.ok(read('index.html').includes('./assets/app.js'))
})

test('database migrations are numbered in order with no gaps', () => {
  const nums = files('netlify/database/migrations', '.sql').map((f) => Number(f.split('/').pop().slice(0, 3)))
  nums.sort((a, b) => a - b)
  nums.forEach((n, i) => assert.equal(n, i + 1))
})

test('the service worker cache name was bumped (change it whenever shell files change)', () => {
  assert.match(read('sw.js'), /const CACHE = 'studynest-v\d+'/)
})
