/**
 * F2 integration tests — run against a local wrangler dev server
 * 
 * Usage:
 *   1. Start the dev server:  yarn dev  (or: wrangler dev --local)
 *   2. Run tests:             node test.mjs
 * 
 * Reads DELETE_AUTH_KEY from .env automatically.
 * Set BASE_URL env var to override (default: http://localhost:8787)
 */

import { readFileSync } from 'fs'

function readEnv() {
  try {
    const env = readFileSync('.env', 'utf-8')
    const match = env.match(/DELETE_AUTH_KEY\s*=\s*"?([^"\n]+)"?/)
    return match?.[1] || null
  } catch { return null }
}

const BASE = process.env.BASE_URL || 'http://localhost:8787'
const AUTH_KEY = process.env.AUTH_KEY || readEnv()

if (!AUTH_KEY) {
  console.error('No AUTH_KEY found. Set it in .env or pass AUTH_KEY env var.')
  process.exit(1)
}

let passed = 0
let failed = 0
const failures = []

async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed++
    failures.push({ name, error: err.message })
    console.log(`  ✗ ${name}`)
    console.log(`    ${err.message}`)
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed')
}

async function post(body) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = null }
  return { res, json, text }
}

async function get(path) {
  return fetch(`${BASE}${path}`)
}

// ─── helpers ──────────────────────────────────────────

async function addTestFile(scope, key, data) {
  const { json } = await post({
    cmd: 'data',
    scope,
    key,
    nanoid: '',
    useVersioning: false,
    data: data || { test: true, ts: Date.now() }
  })
  assert(json?.success, `Failed to add test file ${scope}/${key}: ${JSON.stringify(json)}`)
  return json
}

// ─── test suites ──────────────────────────────────────

console.log('\n── Add (deterministic mode) ──')

await test('add a JSON data file', async () => {
  const { json } = await post({
    cmd: 'data',
    scope: '_test',
    key: 'hello.json',
    nanoid: '',
    useVersioning: false,
    data: { hello: 'world' }
  })
  assert(json.success, 'add failed')
  assert(json.key === '_test/hello.json', `unexpected key: ${json.key}`)
})

await test('read back the file via GET', async () => {
  const res = await get('/_test/hello.json')
  assert(res.ok, `GET failed: ${res.status}`)
  const json = await res.json()
  assert(json.hello === 'world', `unexpected content: ${JSON.stringify(json)}`)
})

await test('overwrite the file (update)', async () => {
  const { json } = await post({
    cmd: 'data',
    scope: '_test',
    key: 'hello.json',
    nanoid: '',
    useVersioning: false,
    data: { hello: 'updated' }
  })
  assert(json.success, 'overwrite failed')
  const res = await get('/_test/hello.json')
  const body = await res.json()
  assert(body.hello === 'updated', `not updated: ${JSON.stringify(body)}`)
})


console.log('\n── List ──')

await test('list files in scope', async () => {
  await addTestFile('_test', 'list-a.json', { a: 1 })
  await addTestFile('_test', 'list-b.json', { b: 2 })

  const { json } = await post({ cmd: 'list', scope: '_test' })
  assert(json.success !== false, `list failed: ${JSON.stringify(json)}`)
  assert(json.total >= 2, `expected at least 2 items, got ${json.total}`)
})

await test('list with pagination (limit)', async () => {
  const { json } = await post({ cmd: 'list', scope: '_test', limit: 1 })
  assert(json.items?.length <= 1, `expected 1 item, got ${json.items?.length}`)
})

await test('list in folder mode', async () => {
  await addTestFile('_test/sub', 'nested.json', { nested: true })

  const { json } = await post({ cmd: 'list', scope: '_test', mode: 'folders' })
  assert(json.folders, 'no folders field in response')
  assert(json.files, 'no files field in response')
})


console.log('\n── Delete (auth) ──')

await test('delete without authKey returns 401', async () => {
  const { res, json } = await post({ cmd: 'delete', key: '_test/hello.json' })
  assert(res.status === 401, `expected 401, got ${res.status}`)
  assert(json.error.includes('Missing authKey'), `unexpected error: ${json.error}`)
})

await test('delete with wrong authKey returns 401', async () => {
  const { res, json } = await post({ cmd: 'delete', authKey: 'wrong-key', key: '_test/hello.json' })
  assert(res.status === 401, `expected 401, got ${res.status}`)
  assert(json.error.includes('Invalid'), `unexpected error: ${json.error}`)
})

await test('delete nonexistent file returns 404', async () => {
  const { json } = await post({ cmd: 'delete', authKey: AUTH_KEY, key: '_test/does-not-exist.json' })
  assert(!json.success, 'should have failed')
})


console.log('\n── Delete (single) ──')

await test('delete a single file', async () => {
  await addTestFile('_test', 'to-delete.json', { delete: 'me' })

  const { json } = await post({ cmd: 'delete', authKey: AUTH_KEY, key: '_test/to-delete.json' })
  assert(json.success, `delete failed: ${JSON.stringify(json)}`)

  const res = await get('/_test/to-delete.json')
  assert(res.status === 404, `file still exists: ${res.status}`)
})


console.log('\n── Delete (bulk) ──')

await test('bulk delete multiple files', async () => {
  await addTestFile('_test', 'bulk-1.json', { n: 1 })
  await addTestFile('_test', 'bulk-2.json', { n: 2 })
  await addTestFile('_test', 'bulk-3.json', { n: 3 })

  const { json } = await post({
    cmd: 'delete',
    authKey: AUTH_KEY,
    keys: ['_test/bulk-1.json', '_test/bulk-2.json', '_test/bulk-3.json']
  })
  assert(json.success, `bulk delete failed: ${JSON.stringify(json)}`)
  assert(json.deleted === 3, `expected 3 deleted, got ${json.deleted}`)
})

await test('bulk delete with some missing files', async () => {
  await addTestFile('_test', 'bulk-exists.json', { exists: true })

  const { json } = await post({
    cmd: 'delete',
    authKey: AUTH_KEY,
    keys: ['_test/bulk-exists.json', '_test/bulk-nope.json']
  })
  assert(json.success, `bulk delete failed: ${JSON.stringify(json)}`)
  assert(json.deleted === 1, `expected 1 deleted, got ${json.deleted}`)
  assert(json.notFound === 1, `expected 1 notFound, got ${json.notFound}`)
})


console.log('\n── Delete (prefix) ──')

await test('delete by prefix', async () => {
  await addTestFile('_test/prefix-del', 'a.json', { a: 1 })
  await addTestFile('_test/prefix-del', 'b.json', { b: 2 })

  const { json } = await post({
    cmd: 'delete',
    authKey: AUTH_KEY,
    prefix: '_test/prefix-del'
  })
  assert(json.success, `prefix delete failed: ${JSON.stringify(json)}`)
  assert(json.deleted === 2, `expected 2 deleted, got ${json.deleted}`)
})


console.log('\n── Rename / Move ──')

await test('rename without authKey returns 401', async () => {
  const { res } = await post({ cmd: 'rename', from: 'a', to: 'b' })
  assert(res.status === 401, `expected 401, got ${res.status}`)
})

await test('rename a file', async () => {
  await addTestFile('_test', 'rename-src.json', { original: true })

  const { json } = await post({
    cmd: 'rename',
    authKey: AUTH_KEY,
    from: '_test/rename-src.json',
    to: '_test/rename-dest.json'
  })
  assert(json.success, `rename failed: ${JSON.stringify(json)}`)

  const srcRes = await get('/_test/rename-src.json')
  assert(srcRes.status === 404, `source still exists: ${srcRes.status}`)

  const destRes = await get('/_test/rename-dest.json')
  assert(destRes.ok, `dest not found: ${destRes.status}`)
  const body = await destRes.json()
  assert(body.original === true, `content not preserved: ${JSON.stringify(body)}`)
})

await test('rename to existing key without overwrite returns 409', async () => {
  await addTestFile('_test', 'rename-a.json', { a: true })
  await addTestFile('_test', 'rename-b.json', { b: true })

  const { json } = await post({
    cmd: 'rename',
    authKey: AUTH_KEY,
    from: '_test/rename-a.json',
    to: '_test/rename-b.json'
  })
  assert(!json.success, 'should have failed')
  assert(json.error.includes('already exists'), `unexpected error: ${json.error}`)
})

await test('rename with overwrite=true replaces destination', async () => {
  const { json } = await post({
    cmd: 'rename',
    authKey: AUTH_KEY,
    from: '_test/rename-a.json',
    to: '_test/rename-b.json',
    overwrite: true
  })
  assert(json.success, `rename w/ overwrite failed: ${JSON.stringify(json)}`)

  const destRes = await get('/_test/rename-b.json')
  const body = await destRes.json()
  assert(body.a === true, `content should be from source: ${JSON.stringify(body)}`)
})

await test('move (alias) works the same as rename', async () => {
  await addTestFile('_test', 'move-src.json', { moved: true })

  const { json } = await post({
    cmd: 'move',
    authKey: AUTH_KEY,
    from: '_test/move-src.json',
    to: '_test/move-dest.json'
  })
  assert(json.success, `move failed: ${JSON.stringify(json)}`)
})

await test('rename nonexistent source returns 404', async () => {
  const { json } = await post({
    cmd: 'rename',
    authKey: AUTH_KEY,
    from: '_test/nope-nope-nope.json',
    to: '_test/whatever.json'
  })
  assert(!json.success, 'should have failed')
})


// ─── cleanup ──────────────────────────────────────────

console.log('\n── Cleanup ──')

await test('delete all _test files', async () => {
  const { json } = await post({
    cmd: 'delete',
    authKey: AUTH_KEY,
    prefix: '_test'
  })
  // might be 0 if previous tests already cleaned up
  assert(json.success || json.error?.includes('No files found'), `cleanup failed: ${JSON.stringify(json)}`)
})


// ─── summary ──────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`)
console.log(`  ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log('\n  Failed tests:')
  failures.forEach(f => console.log(`    ✗ ${f.name}: ${f.error}`))
}
console.log('')

process.exit(failed > 0 ? 1 : 0)
