// =====================================================================
//  Modo sin conexión de SquadLift
//  - Lecturas: se piden a internet; si no hay conexión se usa la última
//    copia guardada en el teléfono (IndexedDB).
//  - Escrituras: sin conexión se guardan en una cola ("outbox") y la app
//    las muestra de inmediato. Al volver internet se envían en orden.
//  Todo pasa por aquí porque Supabase usa este fetch personalizado.
// =====================================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const API_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const nativeFetch = (...a) => globalThis.fetch(...a)

// Tablas cuyo id lo genera el teléfono al crear filas sin conexión
const ID_TABLES = new Set(['routines', 'routine_exercises', 'workout_sessions', 'set_logs', 'body_metrics', 'feed_posts', 'exercises', 'squad_shared_routines'])
// Fecha de creación que se guarda en el momento real (no al sincronizar)
const TS_FIELD = {
  routines: 'created_at', exercises: 'created_at', body_metrics: 'created_at', feed_posts: 'created_at',
  squad_shared_routines: 'created_at', reactions: 'created_at', workout_sessions: 'started_at', set_logs: 'completed_at'
}
// Estas acciones necesitan servidor (códigos, invitaciones, dispositivos)
const ONLINE_ONLY = new Set(['squads', 'squad_invites', 'push_subscriptions', 'squad_members'])
// Relaciones hijo → padre para mostrar al instante lo agregado sin conexión
const CHILDREN = {
  workout_sessions: { set_logs: 'session_id' },
  routines: { routine_exercises: 'routine_id' },
  feed_posts: { reactions: 'post_id' }
}
// Relaciones a uno (ej. exercise:exercises) → columna que las enlaza
const TO_ONE_FK = { exercises: 'exercise_id', routines: 'routine_id', squads: 'squad_id' }
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or', 'and'])

// ---------------- almacenamiento (IndexedDB) ----------------
let dbp = null
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('squadlift-offline', 1)
    r.onupgradeneeded = () => { r.result.createObjectStore('cache'); r.result.createObjectStore('meta') }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  return dbp
}
async function idb(store, mode, fn) {
  try {
    const d = await db()
    return await new Promise((res, rej) => {
      const tx = d.transaction(store, mode); const st = tx.objectStore(store)
      const out = fn(st)
      tx.oncomplete = () => res(out?.result ?? out)
      tx.onerror = () => rej(tx.error)
    })
  } catch { return undefined }
}

const cache = new Map()       // clave de consulta → respuesta guardada
let outbox = []               // cambios pendientes de enviar, en orden
let failed = []               // cambios que el servidor rechazó
let state = { online: typeof navigator === 'undefined' ? true : navigator.onLine, syncing: false }
const listeners = new Set()

export const ready = (async () => {
  try {
    const d = await db()
    await new Promise((res) => {
      const tx = d.transaction(['cache', 'meta'], 'readonly')
      const c = tx.objectStore('cache'); const m = tx.objectStore('meta')
      const keys = c.getAllKeys(); const vals = c.getAll(); const ob = m.get('outbox'); const fl = m.get('failed')
      tx.oncomplete = () => {
        keys.result.forEach((k, i) => cache.set(k, vals.result[i]))
        outbox = ob.result || []; failed = fl.result || []
        res()
      }
      tx.onerror = () => res()
    })
  } catch { /* sin IndexedDB: funciona solo en memoria */ }
})()

const saveOutbox = () => idb('meta', 'readwrite', st => { st.put(outbox, 'outbox'); st.put(failed, 'failed') })
const saveCache = (k, v) => idb('cache', 'readwrite', st => st.put(v, k))

// ---------------- estado para la interfaz ----------------
function emit() { const s = getState(); listeners.forEach(fn => fn(s)) }
export function getState() { return { ...state, pending: outbox.length, failed: failed.length } }
export function subscribe(fn) { listeners.add(fn); fn(getState()); return () => listeners.delete(fn) }
export const isOnline = () => state.online
function setOnline(v) { if (state.online !== v) { state.online = v; emit(); if (v) flushSoon() } }
export function dismissFailed() { failed = []; saveOutbox(); emit() }

let tokenGetter = async () => null
export function setTokenGetter(fn) { tokenGetter = fn }

// ---------------- utilidades de consulta ----------------
function parseReq(url, init = {}) {
  const u = new URL(url)
  const path = u.pathname.split('/rest/v1/')[1] || ''
  const h = new Headers(init.headers || {})
  return {
    u, path, table: path.split('?')[0],
    params: [...u.searchParams.entries()],
    method: (init.method || 'GET').toUpperCase(),
    accept: h.get('Accept') || '',
    prefer: h.get('Prefer') || '',
    headers: h
  }
}
const isObjectAccept = a => a.includes('vnd.pgrst.object')
const cacheKey = (r) => `${r.path}${r.u.search}|${isObjectAccept(r.accept) ? 'obj' : 'arr'}`

/** Divide un select de PostgREST en columnas y relaciones incrustadas */
function parseSelect(sel = '*') {
  const parts = []; let depth = 0, cur = ''
  for (const ch of sel) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = '' } else cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  const embeds = []
  for (const p of parts) {
    const m = p.match(/^(?:([\w]+):)?([\w]+)(?:![\w]+)?\((.*)\)$/s)
    if (m) embeds.push({ key: m[1] || m[2], table: m[2], select: m[3] })
  }
  return embeds
}

function cmp(a, b) {
  const na = Number(a), nb = Number(b)
  if (a !== null && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb) && typeof a !== 'boolean') return na - nb
  return String(a ?? '').localeCompare(String(b ?? ''))
}
function testFilter(val, expr) {
  let neg = false
  if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4) }
  const dot = expr.indexOf('.'); const op = expr.slice(0, dot); const arg = expr.slice(dot + 1)
  let ok
  switch (op) {
    case 'eq': ok = String(val) === arg; break
    case 'neq': ok = String(val) !== arg; break
    case 'gt': ok = cmp(val, arg) > 0; break
    case 'gte': ok = cmp(val, arg) >= 0; break
    case 'lt': ok = cmp(val, arg) < 0; break
    case 'lte': ok = cmp(val, arg) <= 0; break
    case 'is': ok = arg === 'null' ? val == null : String(val) === arg; break
    case 'in': ok = arg.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(val)); break
    default: ok = true // operadores no reconocidos: no se filtra
  }
  return neg ? !ok : ok
}
function matches(row, params) {
  for (const [k, v] of params) {
    if (RESERVED.has(k) || k.includes('.')) continue
    if (!(k in row)) continue
    if (!testFilter(row[k], v)) return false
  }
  return true
}
function applyOrderLimit(rows, params) {
  const order = params.find(([k]) => k === 'order')?.[1]
  if (order) {
    const keys = order.split(',').map(s => { const [c, dir] = s.split('.'); return { c, desc: dir === 'desc' } })
    rows.sort((a, b) => { for (const { c, desc } of keys) { const d = cmp(a[c], b[c]); if (d) return desc ? -d : d } return 0 })
  }
  const limit = Number(params.find(([k]) => k === 'limit')?.[1])
  return limit ? rows.slice(0, limit) : rows
}

/** Busca una fila por id en todo lo guardado (para rellenar relaciones) */
function lookup(table, id) {
  if (id == null) return null
  for (const op of outbox) if (op.table === table && op.method === 'POST') for (const r of op.rows) if (r.id === id) return r
  for (const [k, v] of cache) {
    if (!k.startsWith(table + '?') && !k.startsWith(table + '|')) continue
    const list = Array.isArray(v.body) ? v.body : v.body ? [v.body] : []
    const hit = list.find(r => r && r.id === id)
    if (hit) return hit
  }
  return null
}
function fillEmbeds(row, select) {
  for (const e of parseSelect(select)) {
    if (row[e.key] !== undefined) continue
    if (TO_ONE_FK[e.table]) row[e.key] = lookup(e.table, row[TO_ONE_FK[e.table]])
    else if (e.table === 'profiles') row[e.key] = null
    else row[e.key] = [] // relaciones a muchos: vacías hasta que se agreguen
  }
  return row
}

/** Aplica los cambios pendientes encima de una respuesta (guardada o fresca) */
function overlay(r, base) {
  const isObj = isObjectAccept(r.accept)
  const select = r.params.find(([k]) => k === 'select')?.[1] || '*'
  let rows = (isObj ? (base ? [base] : []) : Array.isArray(base) ? base : []).map(x => (x && typeof x === 'object' ? structuredClone(x) : x))
  const touched = outbox.some(op => op.table === r.table) ||
    parseSelect(select).some(e => outbox.some(op => op.table === e.table))
  if (!touched) return isObj ? (rows[0] ?? null) : rows

  for (const op of outbox) {
    if (op.table !== r.table) continue
    if (op.method === 'POST') {
      for (const nr of op.rows) {
        if (op.conflict) rows = rows.filter(x => !op.conflict.every(c => String(x[c]) === String(nr[c])))
        else rows = rows.filter(x => !(nr.id && x.id === nr.id))
        rows.push(fillEmbeds(structuredClone(nr), select))
      }
    } else if (op.method === 'PATCH') {
      rows.forEach(x => { if (matches(x, op.params)) Object.assign(x, op.body) })
    } else if (op.method === 'DELETE') {
      rows = rows.filter(x => !matches(x, op.params))
    }
  }
  // Relaciones hijas (series de una sesión, ejercicios de una rutina, reacciones)
  for (const e of parseSelect(select)) {
    const fk = CHILDREN[r.table]?.[e.table]
    if (!fk) continue
    for (const row of rows) {
      let kids = Array.isArray(row[e.key]) ? row[e.key] : []
      for (const op of outbox) {
        if (op.table !== e.table) continue
        if (op.method === 'POST') {
          for (const nr of op.rows) {
            if (String(nr[fk]) !== String(row.id)) continue
            if (op.conflict) kids = kids.filter(x => !op.conflict.filter(c => c in x).every(c => String(x[c]) === String(nr[c])))
            kids.push(fillEmbeds(structuredClone(nr), e.select))
          }
        } else if (op.method === 'PATCH') {
          kids.forEach(x => { if (matches({ ...x, [fk]: row.id }, op.params)) Object.assign(x, op.body) })
        } else if (op.method === 'DELETE') {
          kids = kids.filter(x => !matches({ ...x, [fk]: row.id }, op.params))
        }
      }
      row[e.key] = kids
    }
  }
  rows = applyOrderLimit(rows.filter(x => matches(x, r.params)), r.params)
  return isObj ? (rows[0] ?? null) : rows
}

const json = (body, status = 200) => new Response(body === undefined ? null : JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' }
})
const offlineError = (msg) => json({ message: 'OFFLINE: ' + msg, code: 'OFFLINE' }, 503)
const isNetErr = (e) => e instanceof TypeError || e?.name === 'AbortError'

function withTimeout(input, init, ms = 12000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms)
  return nativeFetch(input, { ...init, signal: init?.signal || ctl.signal }).finally(() => clearTimeout(t))
}

// ---------------- fetch que usa Supabase ----------------
export async function offlineFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url
  if (!url.includes('/rest/v1/')) {
    try { const res = await nativeFetch(input, init); setOnline(true); return res }
    catch (e) { if (isNetErr(e)) setOnline(false); throw e }
  }
  await ready
  const r = parseReq(url, init)

  // Funciones del servidor (unirse a squad, récords, etc.): requieren conexión
  if (r.table.startsWith('rpc/')) {
    try { const res = await withTimeout(input, init); setOnline(true); return res }
    catch (e) { setOnline(false); return offlineError('Necesitas conexión para esto.') }
  }

  // ---------- lecturas ----------
  if (r.method === 'GET' || r.method === 'HEAD') {
    const key = cacheKey(r)
    try {
      const res = await withTimeout(input, init)
      setOnline(true)
      if (!res.ok) return res
      const body = await res.clone().json().catch(() => undefined)
      if (body !== undefined) { const v = { body, at: Date.now() }; cache.set(key, v); saveCache(key, v) }
      if (!outbox.length) return res
      return json(overlay(r, body))
    } catch (e) {
      if (!isNetErr(e)) throw e
      setOnline(false)
      return json(overlay(r, cache.get(key)?.body ?? (isObjectAccept(r.accept) ? null : [])))
    }
  }

  // ---------- escrituras ----------
  if (ONLINE_ONLY.has(r.table)) {
    try { const res = await withTimeout(input, init); setOnline(true); return res }
    catch { setOnline(false); return offlineError('Necesitas conexión para esto. Inténtalo cuando vuelva internet.') }
  }

  let body = null
  try { body = init.body ? JSON.parse(init.body) : null } catch { body = null }

  // Con conexión y sin pendientes: directo al servidor
  if (!outbox.length && state.online) {
    try { const res = await withTimeout(input, init); setOnline(true); return res }
    catch (e) { if (!isNetErr(e)) throw e; setOnline(false) }
  }

  // Sin conexión (o con pendientes): a la cola, en orden
  const op = {
    method: r.method, table: r.table, path: r.path, search: r.u.search, params: r.params,
    prefer: r.prefer.replace(/return=representation/, 'return=minimal'),
    conflict: /merge-duplicates/.test(r.prefer) ? (r.params.find(([k]) => k === 'on_conflict')?.[1] || '').split(',').filter(Boolean) : null,
    at: Date.now()
  }
  if (r.method === 'POST') {
    const now = new Date().toISOString()
    op.rows = (Array.isArray(body) ? body : [body]).map(row => {
      const x = { ...row }
      if (ID_TABLES.has(r.table) && !x.id) x.id = crypto.randomUUID()
      const ts = TS_FIELD[r.table]; if (ts && !x[ts]) x[ts] = now
      return x
    })
  } else op.body = body
  outbox.push(op); saveOutbox(); emit(); flushSoon()

  if (r.method === 'POST' && /return=representation/.test(r.prefer)) {
    return json(isObjectAccept(r.accept) ? op.rows[0] : op.rows, 201)
  }
  return new Response(null, { status: r.method === 'POST' ? 201 : 204 })
}

// ---------------- sincronización ----------------
let flushing = null, timer = null
function flushSoon(ms = 400) { clearTimeout(timer); timer = setTimeout(() => flush(), ms) }

export function flush() {
  if (flushing) return flushing
  flushing = (async () => {
    await ready
    if (!outbox.length) return
    state.syncing = true; emit()
    let sent = 0
    try {
      const token = await tokenGetter().catch(() => null)
      if (!token) return
      while (outbox.length) {
        const op = outbox[0]
        const headers = { apikey: API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' }
        headers.Authorization = `Bearer ${token}`
        if (op.prefer) headers.Prefer = op.prefer
        let res
        try {
          res = await withTimeout(`${SUPABASE_URL}/rest/v1/${op.table}${op.search}`, {
            method: op.method, headers, body: op.method === 'POST' ? JSON.stringify(op.rows.length === 1 ? op.rows[0] : op.rows) : op.body ? JSON.stringify(op.body) : undefined
          })
        } catch { setOnline(false); break }
        setOnline(true)
        if (res.ok || res.status === 409) { outbox.shift(); sent++ }
        else if (res.status >= 500 || res.status === 401) break // reintentar luego
        else {
          const err = await res.json().catch(() => ({}))
          failed.push({ ...op, error: err.message || `Error ${res.status}` })
          outbox.shift()
        }
        saveOutbox(); emit()
      }
    } finally {
      state.syncing = false; emit()
      flushing = null
      if (sent && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sl:synced', { detail: { sent } }))
    }
  })()
  return flushing
}

/** Al cerrar sesión: borra la copia local y la cola */
export async function clearAll() {
  cache.clear(); outbox = []; failed = []
  await idb('cache', 'readwrite', st => st.clear())
  await saveOutbox(); emit()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { setOnline(true); flushSoon(200) })
  window.addEventListener('offline', () => setOnline(false))
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flushSoon(500) })
  setInterval(() => { if (outbox.length) flush() }, 20000)
  ready.then(() => { emit(); if (outbox.length) flushSoon(1500) })
}
