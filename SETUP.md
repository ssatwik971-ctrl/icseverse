# StudyNest — Netlify DB setup guide

## 1. Enable Netlify DB on your site

1. Go to your `icseverse` project on Netlify.
2. Open **Integrations** (or **Extensions**, depending on your dashboard version) → search **Netlify DB** → **Enable**.
3. Netlify provisions a Postgres database and automatically sets the
   `NETLIFY_DATABASE_URL` environment variable on your site — you don't need
   to copy/paste a connection string manually.

This is a paid add-on (billed through Netlify) — you mentioned credit is
tight, so check current pricing in the Netlify dashboard before enabling.

## 2. Run the SQL file

With Netlify DB enabled, you can run the schema one of two ways:

**Option A — Netlify CLI (recommended):**
```bash
netlify db:sql < sql/001_create_lessons.sql
```
(If `db:sql` isn't available in your CLI version, update: `npm i -g netlify-cli@latest`.)

**Option B — Any Postgres client:**
Get the connection string with:
```bash
netlify env:get NETLIFY_DATABASE_URL
```
Then run `sql/001_create_lessons.sql` against it with `psql`, TablePlus, DBeaver, etc.

## 3. Add the backend function

1. Copy `functions/lessons.js` into your project's functions folder —
   typically `netlify/functions/lessons.js` (create the folder if it doesn't exist).
2. Copy `functions/package.json`'s one dependency into your project. If you
   already have a `package.json` at the project root, just add this to its
   `dependencies`:
   ```json
   "@netlify/neon": "^1.0.0"
   ```
   Then run `npm install`.
3. If your site doesn't already have a `netlify.toml` pointing to your functions
   folder, add:
   ```toml
   [build]
     functions = "netlify/functions"
   ```

## 4. Apply the frontend patch

Follow `frontend-patch/README.md` step by step:
1. Add the Netlify Identity widget script tag.
2. Replace `getSaved`/`setSaved` with the versions in `lessons-api.patch.js`.
3. Make the small `async`/`await` tweaks listed in `call-site-changes.md`.
4. (Optional) Add the `/api/lessons` redirect in `netlify.toml`.

## 5. Deploy

```bash
git add .
git commit -m "Add Netlify DB-backed lesson storage"
git push
```
Netlify will build and deploy automatically (or run `netlify deploy --prod`
if you deploy manually).

## 6. Test it

1. Open your live site, log in via your existing Identity login page.
2. Generate a lesson → it auto-saves. Open **My Library** — it should load
   from the database (check the Network tab for a call to `/api/lessons`).
3. Log out, refresh, generate another lesson — it should still work, saved
   only to that browser's localStorage (no account = no sync, by design).
4. Log back in — your account's lessons should reappear.

## Notes

- **No separate users table.** Each lesson row is tagged with the Identity
  `user_id` (the JWT `sub`), so Identity alone decides who owns what.
- **Fallback behavior:** if the user isn't logged in, or the function/API is
  unreachable, the app keeps working exactly as before — localStorage only.
  Nothing breaks if Netlify DB has an outage or isn't enabled yet.
- **De-duplication:** saving a lesson with the same subject + topic + mode
  overwrites the existing one (matches your current client-side behavior).
