# How to apply this patch to index.html

Three small edits. Nothing else in your file changes — all your DB, chapters,
UI and AI logic stay exactly as they are.

## 1. Add the Netlify Identity widget script

In `<head>`, right after your existing `<script src="https://js.puter.com/v2/"></script>` line, add:

```html
<script src="https://identity.netlify.com/v1/netlify-identity-widget.js"></script>
```

## 2. Replace the storage functions

Find these two lines near the top of your `<script>` block:

```js
function getSaved(){try{return JSON.parse(localStorage.getItem(STORAGE)||'[]')}catch{return []}}
function setSaved(a){localStorage.setItem(STORAGE,JSON.stringify(a));updateSavedCount()}
```

Replace them with the contents of `lessons-api.patch.js` (in this same folder).
It keeps the same function names (`getSaved`, `setSaved`) so nothing else in
your file needs to change — but makes them talk to your Netlify DB when the
user is logged in, and fall back to localStorage when they're not (or if the
network/API call fails).

## 3. Make save/delete/clear async-aware

Your code calls `getSaved()`/`setSaved()` in a few places as if they were
instant/synchronous. The patch file turns them into `async` functions, so three
call sites need a small tweak — add `await` and make the enclosing function
`async`. See `call-site-changes.md` for the exact lines to change.

## 4. (Optional but recommended) Netlify redirect for a cleaner URL

In your `netlify.toml`, add:

```toml
[[redirects]]
  from = "/api/lessons"
  to = "/.netlify/functions/lessons"
  status = 200
```

Then you can call `/api/lessons` instead of `/.netlify/functions/lessons` everywhere.
