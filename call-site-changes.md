# Call sites to update after adding lessons-api.patch.js

`getSaved()` and `setSaved()` are now `async`. Update these exact spots:

## 1. `saveCurrent()`

**Before:**
```js
function saveCurrent(silent=false){if(!currentLesson){showToast('There is no lesson to save yet.');return}let a=getSaved();const duplicate=a.findIndex(x=>x.subject===currentLesson.subject&&x.topic===currentLesson.topic&&x.mode===currentLesson.mode);const item={...currentLesson,id:duplicate>=0?a[duplicate].id:(Date.now().toString(36)+Math.random().toString(36).slice(2,6))};if(duplicate>=0)a[duplicate]=item;else a.unshift(item);a=a.slice(0,120);setSaved(a);if(!silent)showToast('Saved to My library on this device.');else showToast('Lesson ready — saved to your study library.');}
```

**After:**
```js
async function saveCurrent(silent=false){if(!currentLesson){showToast('There is no lesson to save yet.');return}let a=await getSaved();const duplicate=a.findIndex(x=>x.subject===currentLesson.subject&&x.topic===currentLesson.topic&&x.mode===currentLesson.mode);const item={...currentLesson,id:duplicate>=0?a[duplicate].id:(Date.now().toString(36)+Math.random().toString(36).slice(2,6))};if(duplicate>=0)a[duplicate]=item;else a.unshift(item);a=a.slice(0,120);await setSaved(a);await saveOneLesson(item);if(!silent)showToast(currentUser()?'Saved to your account.':'Saved to My library on this device.');else showToast('Lesson ready — saved to your study library.');}
```

Callers of `saveCurrent` (the save button, and the auto-save-on-generate call)
don't need `await` themselves since it's fire-and-forget from a click handler —
but if you want the "Save" button to show its result only after the server
call finishes, you can `await` it in the click listener too (optional).

## 2. `renderLibrary()` — the "Clear all" button

**Before:**
```js
$('clearLibrary').addEventListener('click',()=>{if(confirm('Delete every saved lesson from this device?')){setSaved([]);renderLibrary();showToast('Saved lessons cleared.')}});
```

**After:**
```js
$('clearLibrary').addEventListener('click',async()=>{if(confirm('Delete every saved lesson from this device?')){await setSaved([]);await clearAllLessons();renderLibrary();showToast('Saved lessons cleared.')}});
```

## 3. `renderLibrary()` — the delete (×) button on each card

**Before:**
```js
document.querySelectorAll('[data-delete-saved]').forEach(b=>b.addEventListener('click',()=>{setSaved(getSaved().filter(x=>x.id!==b.dataset.deleteSaved));renderLibrary();showToast('Lesson deleted.')}));
```

**After:**
```js
document.querySelectorAll('[data-delete-saved]').forEach(b=>b.addEventListener('click',async()=>{const id=b.dataset.deleteSaved;const a=(await getSaved()).filter(x=>x.id!==id);await setSaved(a);await deleteOneLesson(id);renderLibrary();showToast('Lesson deleted.')}));
```

## 4. `showLibrary()` — make sure it loads fresh data before rendering

**Before:**
```js
function showLibrary(){$('teachPanel').classList.add('hidden');$('lessonPanel').classList.add('hidden');$('databasePanel').classList.add('hidden');$('libraryPanel').classList.remove('hidden');renderLibrary();$('libraryPanel').scrollIntoView({behavior:'smooth',block:'start'})}
```

**After:**
```js
async function showLibrary(){$('teachPanel').classList.add('hidden');$('lessonPanel').classList.add('hidden');$('databasePanel').classList.add('hidden');$('libraryPanel').classList.remove('hidden');await getSaved();renderLibrary();$('libraryPanel').scrollIntoView({behavior:'smooth',block:'start'})}
```

## 5. `renderLibrary()` itself — it currently calls `getSaved()` synchronously

**Before:**
```js
function renderLibrary(){const a=getSaved();if(!a.length){...
```

**After:**
```js
function renderLibrary(){const a=getLocalSaved();if(!a.length){...
```

(`renderLibrary` stays synchronous and just reads the local cache, which
`getSaved()` keeps up to date — that's why step 4 calls `await getSaved()`
right before calling `renderLibrary()`.)

## 6. Wire up `init()` to also update the count once Identity is ready

Not required, but recommended — add near the end of `init()`:

```js
if (window.netlifyIdentity) {
  netlifyIdentity.init(); // safe to call even if already initialized by auth.js elsewhere
}
```

If your `auth.html`/`auth.js` already calls `netlifyIdentity.init()` globally
(e.g. via a shared script included on every page), skip this — don't
initialize it twice.
