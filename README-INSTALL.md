# StudyNest account-system patch

This ZIP separates the account UI into `auth.html`, `auth.css`, and `src/auth.js`, and includes an `index.html` updated from the file you uploaded. It also includes a build configuration and merged root dependencies for Netlify Identity plus the existing Netlify Neon lessons function.

## Important findings from your GitHub repository
The public `ssatwik971-ctrl/icseverse` repository currently contains the lessons SQL/function support files and patch notes, but not the live site's `index.html`, `auth.html`, `netlify.toml`, or account code. The uploaded `index.html` is therefore used as the homepage in this package. The repository's root `package.json` currently only declares `@netlify/neon`; this package adds it alongside the account/build dependencies instead of dropping it.

## Files
- `index.html` — your uploaded homepage with auth CSS/module and header account controls added.
- `auth.html` — shared account-page shell for login, signup, reset, and account routes.
- `auth.css` — styles for account pages and header controls.
- `src/auth.js` — account UI using Netlify Identity.
- `build.mjs`, `package.json`, `netlify.toml` — static build, dependencies, redirects, and function routing.

## Before deploying
1. Put these files into the **actual repository connected to your Netlify site**. If `icseverse` is intended to become that repository, add the files at the repository root and ensure the existing lessons function is placed at `netlify/functions/lessons.js` (the repo currently shows `lessons.js` at the root). Keep the SQL schema at `sql/001_create_lessons.sql` or update its path in your setup instructions.
2. Do not replace any other production `index.html` with this one unless it is the same StudyNest homepage you uploaded.
3. In Netlify, enable/configure **Identity** and set the allowed site URL and email confirmation/password-recovery settings. These account pages do not create a SQL users table: account credentials remain in Netlify Identity.
4. If you are using the Netlify DB lessons feature, keep `NETLIFY_DATABASE_URL` configured and run your existing lessons SQL schema once. The function must be under `netlify/functions/lessons.js`.
5. Run `npm install`, then `npm run build`, and test `/login`, `/signup`, `/forgot-password`, `/reset-password`, and `/account` on a deploy preview before production.

## Important limitation
The uploaded homepage still uses its original `localStorage` `getSaved()`/`setSaved()` functions. This ZIP adds account login/signup, but **does not apply the separate `lessons-api.patch.js` and async call-site changes from your repo**. So this ZIP alone does not make the homepage's saved lessons sync to the SQL database; that is a separate frontend integration step.
