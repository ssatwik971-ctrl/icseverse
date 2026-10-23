// Tiny static build: bundles the Netlify Identity client for the browser and copies the site into dist/.
import { build } from 'esbuild'
import { mkdir, copyFile, rm, writeFile } from 'node:fs/promises'
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
for (const f of ['index.html', 'auth.html', 'contact.html', '404.html', 'sw.js', 'manifest.webmanifest', 'robots.txt', 'sitemap.xml']) {
  if (existsSync(f)) await copyFile(f, `dist/${f}`)
}
await copyFile('auth.css', 'dist/assets/auth.css')
await copyFile('assets/app.css', 'dist/assets/app.css')
for (const f of ['favicon.png', 'favicon-32.png', 'icon-192.png', 'apple-touch-icon.png']) {
  if (existsSync(f)) await copyFile(f, `dist/${f}`)
}
// Cloudflare Pages reads redirects from a _redirects file (Netlify uses netlify.toml).
if (process.env.CF_PAGES) {
  const rules = ['/login', '/signup', '/forgot-password', '/reset-password', '/account']
  await writeFile('dist/_redirects', rules.map(p => `${p} /auth.html 200`).join('\n') + '\n')
}
console.log('Built dist/')
