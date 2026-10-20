// Build the static StudyNest site and bundle the account client.
import { build } from 'esbuild'
import { mkdir, copyFile, rm } from 'node:fs/promises'

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
for (const f of ['index.html', 'auth.html']) await copyFile(f, `dist/${f}`)
await copyFile('auth.css', 'dist/assets/auth.css')
console.log('Built dist/')
