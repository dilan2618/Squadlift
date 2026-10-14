export const KG_TO_LB = 2.20462
export const DAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
export const DAYS_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

/** Fecha YYYY-MM-DD en la zona horaria indicada */
export function localDate(tz = 'America/Caracas', d = new Date()) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d) }
  catch { return d.toISOString().slice(0, 10) }
}
/** Día ISO (1 = lunes … 7 = domingo) de una fecha YYYY-MM-DD */
export function isoDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z').getUTCDay()
  return d === 0 ? 7 : d
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export function weekStart(dateStr) { return addDays(dateStr, 1 - isoDay(dateStr)) }

export function toUnit(kg, unit) {
  if (kg == null || kg === '') return ''
  return unit === 'lb' ? Math.round(kg * KG_TO_LB) : Math.round(kg * 2) / 2
}
export function fromUnit(v, unit) { return unit === 'lb' ? v / KG_TO_LB : v }
export const epley = (kg, reps) => kg * (1 + reps / 30)
export const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`
export const tons = kg => (kg / 1000).toLocaleString('es', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

export function initials(name = '') {
  const p = name.trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || p[0]?.[1] || '')).toUpperCase()
}
const PALETTE = ['#7AA7FF', '#C792EA', '#5FD4A8', '#F78C8C', '#FFD166', '#4FC3F7', '#FFA94D']
export function colorFor(id = '') {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'ahora'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  if (s < 172800) return 'ayer'
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

/** Semanas consecutivas cumpliendo la meta. La semana en curso suma solo si ya se cumplió. */
export function weekStreak(weeks, goal, today) {
  const map = new Map(weeks.map(w => [w.week_start, w.days_trained]))
  let ws = weekStart(today), streak = 0
  if ((map.get(ws) || 0) >= goal) streak++
  ws = addDays(ws, -7)
  while ((map.get(ws) || 0) >= goal) { streak++; ws = addDays(ws, -7) }
  return streak
}

const ERRORS = {
  SQUAD_FULL: 'El squad ya tiene 7 integrantes (contando invitaciones pendientes).',
  USER_NOT_FOUND: 'No existe un usuario con ese nombre.',
  ALREADY_MEMBER: 'Esa persona ya está en el squad.',
  CODE_INVALID: 'Ese código no corresponde a ningún squad.',
  INVITE_INVALID: 'La invitación ya no es válida.',
  'duplicate key': 'Eso ya existe.',
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'Confirma tu correo antes de entrar. Revisa tu bandeja de entrada.',
  'User already registered': 'Ese correo ya tiene cuenta. Inicia sesión.',
  'profiles_username_key': 'Ese nombre de usuario ya está en uso.',
  'username_check': 'El usuario debe tener 3–24 caracteres: minúsculas, números o _.',
  'should be different from the old password': 'La contraseña nueva debe ser distinta de la anterior.',
  'Password should be at least': 'La contraseña necesita al menos 8 caracteres.',
  'For security purposes, you can only request this after': 'Por seguridad, espera un minuto antes de pedir otro enlace.',
  'rate limit': 'Se enviaron demasiados correos seguidos. Espera unos minutos e inténtalo de nuevo.',
  'Auth session missing': 'El enlace ya no es válido o caducó. Pide uno nuevo desde "Olvidé mi contraseña".',
  'otp_expired': 'El enlace caducó o ya se usó. Pide uno nuevo desde "Olvidé mi contraseña".'
}
export function friendlyError(err) {
  const msg = err?.message || String(err)
  for (const k of Object.keys(ERRORS)) if (msg.includes(k)) return ERRORS[k]
  return 'Algo salió mal: ' + msg
}
