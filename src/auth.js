import {
  getUser, login, signup, logout, updateUser, requestPasswordRecovery,
  handleAuthCallback, onAuthChange, AuthError, MissingIdentityError,
} from '@netlify/identity'
import * as Identity from '@netlify/identity'

const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const CALLBACK_RE = /(recovery_token|confirmation_token|invite_token|email_change_token|access_token|error_description)=/

const TOAST_MS = 3200 // keep in sync with TOAST_MS in index.html

let currentUser = null
let toastTimer = null
let menuClose = null

/* ---------- device id + ban checks (server side: netlify/functions/guard.mjs) ---------- */
const DEVICE_KEY = 'studynest_device_v1'
function deviceId() {
  let v = ''
  try { v = localStorage.getItem(DEVICE_KEY) || '' } catch { /* blocked storage */ }
  if (!v) { const m = document.cookie.match(/(?:^|; )sn_dev=([0-9a-f-]{36})/i); if (m) v = m[1] }
  if (!v) v = (crypto.randomUUID && crypto.randomUUID()) || ''
  if (!v) return ''
  try { localStorage.setItem(DEVICE_KEY, v) } catch { /* ignore */ }
  try { document.cookie = `sn_dev=${v}; max-age=315360000; path=/; SameSite=Lax; Secure` } catch { /* ignore */ }
  return v
}
window.studynestDeviceId = deviceId

// Returns the server's answer, or null if the check could not run (the site then keeps working).
async function guardCall(action, extra = {}) {
  try {
    const r = await fetch('/api/guard', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, deviceId: deviceId(), ...extra }) })
    return r.ok ? await r.json() : null
  } catch { return null }
}
let goingBanned = false
async function goBanned(g) {
  if (goingBanned) return
  goingBanned = true
  try { await logout() } catch { /* the server blocks banned users anyway */ }
  currentUser = null
  const q = new URLSearchParams({ r: String(g?.reason || '').slice(0, 300) })
  if (g?.until) q.set('u', g.until)
  location.replace('/banned?' + q)
}
// Called by the study page on every AI request (fire and forget).
window.studynestTrack = (type) => { if (currentUser) guardCall('event', { type }).then((g) => { if (g?.banned) goBanned(g) }) }
async function sessionCheck() {
  if (!currentUser || goingBanned) return
  const g = await guardCall('session')
  if (g?.banned) goBanned(g)
}

/* ---------- safe user lookup ----------
   getUser() asks Netlify "who is this?" (/.netlify/identity/user). With an old or broken login it fails (HTTP 400),
   and the login library then fires an auth event, which used to trigger another getUser() call: a loop of 400s.
   loadUser() fixes that: one request at a time, and after a failure it waits 30 s before asking again. */
let userInflight = null
let userFailedAt = 0
let userLookupThrew = false
const USER_RETRY_MS = 30000
async function loadUser() {
  if (userInflight) return userInflight
  if (userFailedAt && Date.now() - userFailedAt < USER_RETRY_MS) return null
  userInflight = (async () => {
    try {
      const u = await getUser()
      userFailedAt = u ? 0 : Date.now()
      return u || null
    } catch {
      userFailedAt = Date.now()
      userLookupThrew = true
      return null
    } finally {
      setTimeout(() => { userInflight = null }, 0)
    }
  })()
  return userInflight
}

// Lets the study page renew an expired login before it retries a saved-lessons request.
window.studynestRefreshSession = async () => {
  try {
    if (typeof Identity.refreshSession === 'function') { await Identity.refreshSession(); return true }
    return !!(await loadUser())
  } catch { return false }
}

// One document-level listener for the user menu (renderHeader runs many times and must not add more).
document.addEventListener('click', (e) => { const d = $('userDrop'); if (menuClose && d && !d.contains(e.target)) menuClose() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuClose) { menuClose(); const b = $('userBtn'); if (b) b.focus() } })

function toast(msg) {
  const t = $('toast')
  if (!t) return
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), TOAST_MS)
}

function displayName(u) {
  return (u?.name || u?.userMetadata?.full_name || (u?.email ? u.email.split('@')[0] : '') || 'Student').toString()
}

// Only allow same-site relative paths as post-login destinations.
function safeNext() {
  const n = new URLSearchParams(location.search).get('next')
  return n && /^\/(?![/\\])/.test(n) ? n : '/'
}

function friendlyError(err, ctx) {
  if (err instanceof MissingIdentityError) return 'Accounts are not available right now. Please try again later.'
  if (ctx === 'login') {
    // Read the status from wherever the library put it, and look at the message too.
    const status = Number(err?.status ?? err?.statusCode ?? err?.cause?.status) || 0
    const m = String(err?.message || err?.cause?.message || '').toLowerCase()
    if (m.includes('not confirmed') || m.includes('confirm your')) return 'Please confirm your email first. Check your inbox for the confirmation link.'
    // Real connection or server trouble: no network, or a 5xx.
    const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) ||
      err instanceof TypeError || /failed to fetch|networkerror|network request|load failed/.test(m)
    if (offline || status >= 500) return 'Something went wrong. Please check your connection and try again.'
    // Anything else from the login call means the server answered and said no.
    return 'Incorrect email or password.'
  }
  if (err instanceof AuthError) {
    const m = (err.message || '').toLowerCase()
    if (ctx === 'login') {
      if (m.includes('not confirmed') || m.includes('confirm')) return 'Please confirm your email first. Check your inbox for the confirmation link.'
      // Only real credential rejections count as "wrong password"; a missing or failing service must not.
      if (err.status === 400 || err.status === 401) return 'Incorrect email or password.'
      return 'Something went wrong. Please check your connection and try again.'
    }
    if (ctx === 'signup') {
      if (err.status === 403) return 'New sign-ups are currently closed.'
      if (m.includes('already') || m.includes('registered') || m.includes('exists')) return 'An account with this email already exists. Try logging in instead.'
      if (err.status === 422) return 'Please check your email and password and try again.'
    }
    if (ctx === 'update' && err.status === 401) return 'Your session has expired. Please log in again.'
    if (err.status === 422) return 'That password is not accepted. Please choose a stronger one.'
  }
  return 'Something went wrong. Please check your connection and try again.'
}

function validatePassword(pw) {
  if (pw.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must include at least one letter and one number.'
  return ''
}

/* ---------- Header controls (every page) ---------- */
function renderHeader() {
  const box = $('authControls')
  if (!box) return
  menuClose = null
  const page = location.pathname
  if (!currentUser) {
    const next = page === '/' || page === '/index.html' ? '' : '?next=' + encodeURIComponent(page)
    box.innerHTML = `<a class="btn btn-light btn-sm" href="/login${next}">Log in</a><a class="btn btn-primary btn-sm" href="/signup${next}"><span class="long">Create account</span><span class="short">Sign up</span></a>`
    return
  }
  const name = displayName(currentUser)
  box.innerHTML = `<div class="user-menu"><button type="button" class="user-btn" id="userBtn" aria-haspopup="true" aria-expanded="false" aria-controls="userDrop"><span class="avatar" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</span><span class="user-name">${esc(name)}</span><span aria-hidden="true">▾</span></button><div class="user-drop hidden" id="userDrop"><div class="user-drop-head">${esc(currentUser.email || '')}</div><a href="/account">Account</a><button type="button" id="logoutBtn">Log out</button></div></div>`
  const btn = $('userBtn'), drop = $('userDrop')
  const close = () => { drop.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false') }
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    const open = drop.classList.contains('hidden')
    drop.classList.toggle('hidden', !open)
    btn.setAttribute('aria-expanded', String(open))
  })
  menuClose = close
  $('logoutBtn').addEventListener('click', doLogout)
}

// Tells the study page (index.html) who is signed in so saved lessons can sync with the account.
function announceAuth(type) {
  try { window.dispatchEvent(new CustomEvent('studynest-auth', { detail: { type, userId: currentUser ? String(currentUser.id || currentUser.email || '') : '' } })) } catch { /* not critical */ }
}

async function doLogout() {
  try { await logout() } catch { /* local session is cleared regardless */ }
  currentUser = null
  renderHeader()
  announceAuth('logout')
  if (location.pathname === '/account' || document.body.dataset.page === 'app') location.assign('/login')
  else toast('You have been logged out.')
}

/* ---------- Form helpers (auth page) ---------- */
function setMsg(kind, text) {
  const m = $('formMsg')
  if (!m) return
  m.className = 'form-msg ' + kind
  m.textContent = text
  m.classList.toggle('hidden', !text)
}
function setFieldError(id, text) {
  const input = $(id), err = $(id + 'Err')
  if (!input || !err) return
  err.textContent = text || ''
  input.setAttribute('aria-invalid', text ? 'true' : 'false')
}
function setBusy(btn, busy, label) {
  btn.disabled = busy
  btn.innerHTML = busy ? `<span class="btn-spin" aria-hidden="true"></span> ${esc(label)}` : btn.dataset.label
}
function wireToggles() {
  document.querySelectorAll('[data-toggle-pw]').forEach((b) => {
    b.addEventListener('click', () => {
      const targets = b.dataset.togglePw.split(',').map($)
      const show = targets[0].type === 'password'
      targets.forEach((i) => { i.type = show ? 'text' : 'password' })
      b.textContent = show ? 'Hide' : 'Show'
      b.setAttribute('aria-pressed', String(show))
    })
  })
}
function guard(form, btn, busyLabel, fn) {
  let running = false
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (running) return
    running = true
    setMsg('', '')
    setBusy(btn, true, busyLabel)
    try { await fn() } finally { running = false; if (btn.isConnected && !btn.dataset.done) setBusy(btn, false) }
  })
}

/* ---------- Views ---------- */
const VIEWS = {
  '/login': {
    title: 'Log in',
    sub: 'Welcome back! Log in to your StudyNest account.',
    html: `<form id="f" novalidate>
      <div class="field"><label for="email">Email address</label><input id="email" type="email" autocomplete="email" required><div class="err" id="emailErr"></div></div>
      <div class="field"><label for="password">Password</label><div class="pw-wrap"><input id="password" type="password" autocomplete="current-password" required><button type="button" class="pw-toggle" data-toggle-pw="password" aria-pressed="false">Show</button></div><div class="err" id="passwordErr"></div></div>
      <div class="form-msg hidden" id="formMsg" role="alert"></div>
      <button class="btn btn-primary btn-block" id="submit" type="submit" data-label="Log in">Log in</button>
      <div class="auth-links"><a href="/forgot-password">Forgot password?</a><span>New here? <a href="/signup">Create account</a></span></div>
    </form>`,
    init() {
      const f = $('f'), btn = $('submit')
      guard(f, btn, 'Logging in…', async () => {
        const email = $('email').value.trim(), pw = $('password').value
        setFieldError('email', EMAIL_RE.test(email) ? '' : 'Enter a valid email address.')
        setFieldError('password', pw ? '' : 'Enter your password.')
        if (!EMAIL_RE.test(email) || !pw) return
        const pre = await guardCall('precheck', { email })
        if (pre?.banned) return goBanned(pre)
        try {
          currentUser = await login(email, pw)
          const g = await guardCall('session')
          if (g?.banned) return goBanned(g)
          btn.dataset.done = '1'
          setMsg('ok', 'Logged in! Taking you back…')
          location.assign(safeNext())
        } catch (err) { guardCall('event', { type: 'login_fail', email }); setMsg('error', friendlyError(err, 'login')) }
      })
    },
  },
  '/signup': {
    title: 'Create your account',
    sub: 'Free and optional — you can always use StudyNest without an account.',
    html: `<form id="f" novalidate>
      <div class="field"><label for="name">Display name</label><input id="name" type="text" autocomplete="nickname" maxlength="60" required><div class="err" id="nameErr"></div></div>
      <div class="field"><label for="email">Email address</label><input id="email" type="email" autocomplete="email" required><div class="err" id="emailErr"></div></div>
      <div class="field"><label for="password">Password</label><div class="pw-wrap"><input id="password" type="password" autocomplete="new-password" aria-describedby="pwHint" required><button type="button" class="pw-toggle" data-toggle-pw="password,confirm" aria-pressed="false">Show</button></div><div class="hint" id="pwHint">At least 8 characters, with a letter and a number.</div><div class="err" id="passwordErr"></div></div>
      <div class="field"><label for="confirm">Confirm password</label><input id="confirm" type="password" autocomplete="new-password" required><div class="err" id="confirmErr"></div></div>
      <div class="form-msg hidden" id="formMsg" role="alert"></div>
      <button class="btn btn-primary btn-block" id="submit" type="submit" data-label="Create account">Create account</button>
      <div class="auth-links"><span>Already have an account? <a href="/login">Log in</a></span></div>
    </form>`,
    init() {
      const f = $('f'), btn = $('submit')
      guard(f, btn, 'Creating account…', async () => {
        const name = $('name').value.trim(), email = $('email').value.trim(), pw = $('password').value, cf = $('confirm').value
        const errs = {
          name: name.length < 2 ? 'Enter a display name (at least 2 characters).' : '',
          email: EMAIL_RE.test(email) ? '' : 'Enter a valid email address.',
          password: validatePassword(pw),
          confirm: pw !== cf ? 'Passwords do not match.' : '',
        }
        Object.entries(errs).forEach(([k, v]) => setFieldError(k, v))
        if (Object.values(errs).some(Boolean)) return
        const pre = await guardCall('precheck', { email })
        if (pre?.banned) return goBanned(pre)
        try {
          const user = await signup(email, pw, { full_name: name })
          btn.dataset.done = '1'
          btn.disabled = true
          if (user?.confirmedAt) {
            currentUser = user
            setMsg('ok', 'Account created! You are logged in. Taking you back…')
            location.assign(safeNext())
          } else {
            f.querySelectorAll('input,button.pw-toggle').forEach((el) => { el.disabled = true })
            setMsg('ok', `Account created! We sent a confirmation link to ${email}. Open it to activate your account, then log in.`)
          }
        } catch (err) { setMsg('error', friendlyError(err, 'signup')) }
      })
    },
  },
  '/forgot-password': {
    title: 'Reset your password',
    sub: 'Enter your email and we will send you a link to choose a new password.',
    html: `<form id="f" novalidate>
      <div class="field"><label for="email">Email address</label><input id="email" type="email" autocomplete="email" required><div class="err" id="emailErr"></div></div>
      <div class="form-msg hidden" id="formMsg" role="alert"></div>
      <button class="btn btn-primary btn-block" id="submit" type="submit" data-label="Send reset link">Send reset link</button>
      <div class="auth-links"><a href="/login">Back to log in</a><a href="/signup">Create account</a></div>
    </form>`,
    init() {
      const f = $('f'), btn = $('submit')
      if (new URLSearchParams(location.search).get('expired')) setMsg('error', 'That link is invalid or has expired. Please request a new reset link.')
      guard(f, btn, 'Sending…', async () => {
        const email = $('email').value.trim()
        setFieldError('email', EMAIL_RE.test(email) ? '' : 'Enter a valid email address.')
        if (!EMAIL_RE.test(email)) return
        try {
          await requestPasswordRecovery(email)
          // Same wording whether or not the email is registered, so accounts can't be probed.
          setMsg('ok', 'If an account exists for that email, a reset link is on its way. Check your inbox (and spam folder).')
        } catch (err) { setMsg('error', friendlyError(err, 'recover')) }
      })
    },
  },
  '/reset-password': {
    title: 'Choose a new password',
    sub: 'Pick a new password for your account.',
    needsUser: 'expired',
    html: `<form id="f" novalidate>
      <div class="field"><label for="password">New password</label><div class="pw-wrap"><input id="password" type="password" autocomplete="new-password" aria-describedby="pwHint" required><button type="button" class="pw-toggle" data-toggle-pw="password,confirm" aria-pressed="false">Show</button></div><div class="hint" id="pwHint">At least 8 characters, with a letter and a number.</div><div class="err" id="passwordErr"></div></div>
      <div class="field"><label for="confirm">Confirm new password</label><input id="confirm" type="password" autocomplete="new-password" required><div class="err" id="confirmErr"></div></div>
      <div class="form-msg hidden" id="formMsg" role="alert"></div>
      <button class="btn btn-primary btn-block" id="submit" type="submit" data-label="Save new password">Save new password</button>
    </form>`,
    init() {
      const f = $('f'), btn = $('submit')
      guard(f, btn, 'Saving…', async () => {
        const pw = $('password').value, cf = $('confirm').value
        const errs = { password: validatePassword(pw), confirm: pw !== cf ? 'Passwords do not match.' : '' }
        Object.entries(errs).forEach(([k, v]) => setFieldError(k, v))
        if (Object.values(errs).some(Boolean)) return
        try {
          await updateUser({ password: pw })
          btn.dataset.done = '1'
          btn.disabled = true
          setMsg('ok', 'Password updated! Taking you to your account…')
          setTimeout(() => location.assign('/account'), 1200)
        } catch (err) { setMsg('error', friendlyError(err, 'update')) }
      })
    },
  },
  '/account': {
    title: 'Your account',
    sub: 'Your StudyNest profile.',
    needsUser: 'login',
    html: `<dl class="profile">
      <div><dt>Display name</dt><dd id="pName"></dd></div>
      <div><dt>Email address</dt><dd id="pEmail"></dd></div>
      <div><dt>Account status</dt><dd id="pStatus"></dd></div>
    </dl>
    <form id="f" novalidate class="acct-form">
      <div class="field"><label for="name">Change display name</label><input id="name" type="text" maxlength="60" autocomplete="nickname"><div class="err" id="nameErr"></div></div>
      <div class="form-msg hidden" id="formMsg" role="alert"></div>
      <button class="btn btn-primary" id="submit" type="submit" data-label="Save name">Save name</button>
    </form>
    <div class="acct-actions"><button class="btn btn-outline" id="acctLogout" type="button">Log out</button><a class="btn btn-light" href="/forgot-password">Change password</a></div>`,
    init() {
      const fill = () => {
        $('pName').textContent = displayName(currentUser)
        $('pEmail').textContent = currentUser.email || ''
        $('pStatus').innerHTML = currentUser.confirmedAt ? '<span class="tag ok">✓ Email confirmed</span>' : '<span class="tag orange">Email not confirmed</span>'
        $('name').value = displayName(currentUser)
      }
      fill()
      $('acctLogout').addEventListener('click', doLogout)
      const f = $('f'), btn = $('submit')
      guard(f, btn, 'Saving…', async () => {
        const name = $('name').value.trim()
        setFieldError('name', name.length >= 2 ? '' : 'Enter a display name (at least 2 characters).')
        if (name.length < 2) return
        try {
          currentUser = await updateUser({ data: { full_name: name } })
          fill(); renderHeader()
          setMsg('ok', 'Display name updated.')
        } catch (err) { setMsg('error', friendlyError(err, 'update')) }
      })
    },
  },
}

async function renderAuthPage() {
  const path = location.pathname.replace(/\/+$/, '') || '/'
  const view = VIEWS[path === '/auth.html' ? '/login' : path] || VIEWS['/login']
  document.title = `${view.title} — StudyNest`
  const card = $('authCard')
  if (view.needsUser && !currentUser) {
    if (view.needsUser === 'login') return location.replace('/login?next=' + encodeURIComponent(path))
    card.innerHTML = `<h1>Link expired</h1><p class="sub">This password reset link is invalid or has expired.</p><a class="btn btn-primary btn-block" href="/forgot-password">Request a new link</a>`
    return
  }
  if (!view.needsUser && currentUser && (path === '/login' || path === '/signup')) return location.replace(safeNext())
  card.innerHTML = `<h1>${esc(view.title)}</h1><p class="sub">${esc(view.sub)}</p>${view.html}`
  wireToggles()
  view.init()
  const first = card.querySelector('input')
  if (first) first.focus({ preventScroll: true })
}

/* ---------- Boot ---------- */
async function boot() {
  // A reset link opens on any page. Move it, token included, to the reset page first,
  // so the same page that reads the token also shows the new-password form (no reload in between).
  if (/recovery_token=/.test(location.hash) && location.pathname.replace(/\/+$/, '') !== '/reset-password') {
    return location.replace('/reset-password' + location.hash)
  }
  let recovered = null
  const hadCallback = CALLBACK_RE.test(location.hash)
  if (hadCallback) {
    try {
      const result = await handleAuthCallback()
      history.replaceState(null, '', location.pathname + location.search)
      if (result?.type === 'recovery') recovered = result.user || null
      if (result?.type === 'confirmation' || result?.type === 'email_change') {
        currentUser = result.user || null
        toast('Email confirmed. Welcome to StudyNest!')
      }
    } catch (err) {
      history.replaceState(null, '', location.pathname + location.search)
      // A bad or expired emailed link: send the user to request a fresh one.
      if (location.pathname !== '/forgot-password') return location.replace('/forgot-password?expired=1')
    }
  }
  currentUser = await loadUser()
  // A saved login that the server rejects is cleared once, so the browser stops sending it.
  if (!currentUser && !recovered && userLookupThrew) { try { await logout() } catch { /* already signed out */ } }
  if (!currentUser && recovered) currentUser = recovered
  // The study page needs an account: logged-out visitors go to the login page first.
  if (document.body.dataset.page === 'app') {
    if (!currentUser) return location.replace('/login')
    document.body.classList.add('auth-ok')
  }
  renderHeader()
  sessionCheck()
  setInterval(sessionCheck, 90000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sessionCheck() })
  // Defer so listeners registered by the page (index.html) are in place before the first event.
  setTimeout(() => announceAuth('init'), 0)
  onAuthChange(async (event, user) => {
    // Do not call getUser() again after a logout or a failed lookup: that is what caused the loop of 400 errors.
    currentUser = user ?? (event === 'logout' ? null : await loadUser())
    renderHeader()
    announceAuth(currentUser ? (event === 'login' ? 'login' : 'update') : 'logout')
    if (!currentUser && (location.pathname === '/account' || document.body.dataset.page === 'app')) location.replace('/login')
  })
  if (document.body.dataset.page === 'auth') await renderAuthPage()
}

boot()
