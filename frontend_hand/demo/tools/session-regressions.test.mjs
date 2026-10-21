import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const source = readFileSync(new URL('../scripts/api.js', import.meta.url), 'utf8')
function client(refreshOK = true) {
  const storage = new Map([['mb_access_token', 'old'], ['feisi_backend', 'live']])
  const calls = [], redirects = []
  const window = {
    localStorage: {
      getItem: k => storage.get(k),
      setItem: (k, v) => storage.set(k, v),
      removeItem: k => storage.delete(k),
    },
    location: { pathname: '/my-growth.html', search: '', replace: u => redirects.push(u) },
    setTimeout,
    clearTimeout,
  }
  const fetch = async (url, options) => {
    calls.push(url)
    if (url.endsWith('/auth/refresh')) {
      await new Promise(r => setTimeout(r, 5))
      return { ok: refreshOK, status: refreshOK ? 200 : 401, json: async () => refreshOK ? { code: 'OK', data: { accessToken: 'new' } } : { code: 'TOKEN_INVALID' } }
    }
    const ok = options.headers.Authorization === 'Bearer new'
    return { ok, status: ok ? 200 : 401, json: async () => ok ? { code: 'OK', data: { id: 1 } } : { code: 'TOKEN_EXPIRED' } }
  }
  vm.runInNewContext(source, { window, fetch, URLSearchParams })
  return { api: window.FeisiAPI, calls, redirects, storage }
}
test('expired token refreshes once for concurrent requests and retries both', async () => {
  const c = client()
  const rows = await Promise.all([c.api.get('/users/me'), c.api.get('/notifications')])
  assert.equal(rows.length, 2)
  assert.equal(c.calls.filter(x => x.endsWith('/auth/refresh')).length, 1)
  assert.equal(c.storage.get('mb_access_token'), 'new')
  assert.equal(c.redirects.length, 0)
})
test('failed refresh clears login and returns to the login page', async () => {
  const c = client(false)
  await assert.rejects(c.api.get('/users/me'))
  assert.equal(c.storage.has('mb_access_token'), false)
  assert.equal(c.redirects.length, 1)
})
