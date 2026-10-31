// Static build: bundles the Netlify Identity client and copies the site into dist/.
import { build } from 'esbuild'
import { mkdir, copyFile, rm, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

await rm('dist', { recursive: true, force: true })
await mkdir('dist/assets', { recursive: true })

await build({
  entryPoints: ['src/auth.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  outfile: 'dist/assets/auth.js',
})

// Every file in the repo root goes to dist/ EXCEPT source/config that must not be published:
// .js/.mjs (bundled or server-side), .sql (db migrations), .css (copied to dist/assets below),
// project config and docs. Netlify functions live in netlify/ (a directory) and are never copied.
const SKIP_EXT = new Set(['.js', '.mjs', '.cjs', '.sql', '.css', '.md', '.toml', '.lock'])
const SKIP_NAMES = new Set(['package.json', 'package-lock.json'])
for (const e of await readdir('.', { withFileTypes: true })) {
  if (!e.isFile() || e.name.startsWith('.') || SKIP_NAMES.has(e.name)) continue
  const ext = e.name.includes('.') ? e.name.slice(e.name.lastIndexOf('.')).toLowerCase() : ''
  if (SKIP_EXT.has(ext)) continue
  await copyFile(e.name, `dist/${e.name}`)
}

// Exceptions the site needs at runtime even though they are .js/.css:
// the service worker must sit at the site root to control the whole origin,
// and the stylesheets are referenced as /assets/*.css by the pages.
if (existsSync('sw.js')) await copyFile('sw.js', 'dist/sw.js')
// Every script and stylesheet in assets/ is published (auth.js is made by the bundle above).
for (const e of await readdir('assets', { withFileTypes: true })) {
  if (e.isFile() && /\.(js|css)$/.test(e.name)) await copyFile(`assets/${e.name}`, `dist/assets/${e.name}`)
}
if (existsSync('auth.css')) await copyFile('auth.css', 'dist/assets/auth.css')
if (!existsSync('dist/assets/auth.css')) console.warn('Warning: auth.css not found; index.html and auth.html link to /assets/auth.css')

console.log('Built dist/')
