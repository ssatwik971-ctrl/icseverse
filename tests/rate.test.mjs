import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rateLimited, RATE_MAX, RATE_WINDOW_MS } from '../netlify/lib/rate.mjs'

test('allows RATE_MAX requests, then blocks with a wait time', () => {
  const t = 1_000_000
  for (let i = 0; i < RATE_MAX; i++) assert.equal(rateLimited('u1', t + i), 0)
  const wait = rateLimited('u1', t + RATE_MAX)
  assert.ok(wait > 0 && wait <= RATE_WINDOW_MS / 1000)
})

test('another user is not affected', () => {
  assert.equal(rateLimited('someone-else', 2_000_000), 0)
})

test('allowed again after the window passes', () => {
  const t = 5_000_000
  for (let i = 0; i < RATE_MAX; i++) rateLimited('u2', t)
  assert.ok(rateLimited('u2', t + 1) > 0)
  assert.equal(rateLimited('u2', t + RATE_WINDOW_MS + 1), 0)
})
