// Replaces the two localStorage-only functions. Same names, same job —
// getSaved() still returns the array of lessons, setSaved() still saves them
// and updates the count badge — but now it's backed by your Netlify DB when
// the user is logged in via Netlify Identity, with localStorage as a fallback
// so the app keeps working offline or while logged out.

const LESSONS_API = '/api/lessons'; // change to '/.netlify/functions/lessons' if you skip the redirect

function currentUser() {
  return (window.netlifyIdentity && window.netlifyIdentity.currentUser()) || null;
}

async function authHeaders() {
  const user = currentUser();
  if (!user) return null;
  const token = await user.jwt(); // refreshes if expired
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Local cache so the UI can render instantly; synced from/to the server when possible.
function getLocalSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE) || '[]'); } catch { return []; }
}
function setLocalSaved(a) {
  localStorage.setItem(STORAGE, JSON.stringify(a));
}

async function getSaved() {
  const headers = await authHeaders();
  if (!headers) return getLocalSaved(); // not logged in: local only

  try {
    const res = await fetch(LESSONS_API, { headers });
    if (!res.ok) throw new Error('fetch failed');
    const { lessons } = await res.json();
    setLocalSaved(lessons); // keep local cache in sync
    return lessons;
  } catch {
    return getLocalSaved(); // offline/error: fall back to last known local copy
  }
}

async function setSaved(a) {
  // Always keep the local copy current (instant UI, and the offline fallback).
  setLocalSaved(a);
  updateSavedCount();
  // Server sync happens per-item in saveOneLesson/deleteOneLesson/clearAllLessons below,
  // since setSaved() receives the *whole new array* (e.g. after a delete or a save),
  // and we don't want to re-upload every lesson on every change.
}

// Save (create or update) exactly one lesson to the server, then refresh the local cache.
async function saveOneLesson(item) {
  const headers = await authHeaders();
  if (!headers) return; // not logged in — localStorage-only mode, nothing more to do
  try {
    await fetch(LESSONS_API, { method: 'POST', headers, body: JSON.stringify(item) });
  } catch {
    // Silently keep the local copy; user is still offline-functional.
  }
}

async function deleteOneLesson(id) {
  const headers = await authHeaders();
  if (!headers) return;
  try {
    await fetch(`${LESSONS_API}?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers });
  } catch {}
}

async function clearAllLessons() {
  const headers = await authHeaders();
  if (!headers) return;
  try {
    await fetch(`${LESSONS_API}?all=true`, { method: 'DELETE', headers });
  } catch {}
}

// When the user logs in (e.g. via the Identity widget), pull their server lessons
// and merge them into the local view so My Library shows them right away.
if (window.netlifyIdentity) {
  netlifyIdentity.on('login', async () => {
    const lessons = await getSaved(); // this call now has a logged-in user, so it hits the server
    updateSavedCount();
    if (typeof renderLibrary === 'function' && !$('libraryPanel').classList.contains('hidden')) {
      renderLibrary();
    }
  });
  netlifyIdentity.on('logout', () => {
    updateSavedCount();
  });
}
