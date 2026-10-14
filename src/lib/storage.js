// localStorage seguro (modo privado de Safari puede lanzar errores)
export function load(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}
export function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* sin espacio o bloqueado */ }
}
export function remove(key) {
  try { localStorage.removeItem(key) } catch { /* nada */ }
}
