// Tiny static build: bundles the Netlify Identity client for the browser and copies the pages into dist/.
import { build } from 'esbuild'
import { mkdir, copyFile, rm } from 'node:fs/promises'
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
for (const f of ['index.html', 'auth.html', 'contact.html']) {
  if (existsSync(f)) await copyFile(f, `dist/${f}`)
}
await copyFile('auth.css', 'dist/assets/auth.css')
for (const f of ['favicon.png', 'favicon-32.png', 'apple-touch-icon.png']) {
  if (existsSync(f)) await copyFile(f, `dist/${f}`)
}
console.log('Built dist/')
