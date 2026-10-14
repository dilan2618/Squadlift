// Sistema de temas: todos los colores de la app salen de variables CSS (--c-*)
// que se cambian en vivo. El tema se guarda en el teléfono y en tu perfil.
import { load, save } from './storage'

export const COLOR_KEYS = [
  { key: 'accent', label: 'Color principal', hint: 'Botones, progreso y gráficos' },
  { key: 'ok', label: 'Éxito', hint: 'Series hechas, días entrenados' },
  { key: 'danger', label: 'Alerta', hint: 'Borrar y errores' },
  { key: 'bg', label: 'Fondo', hint: 'Detrás de todo' },
  { key: 'surface', label: 'Tarjetas', hint: 'Bloques de contenido' },
  { key: 'surface2', label: 'Controles', hint: 'Campos, chips y pistas' },
  { key: 'line', label: 'Bordes', hint: 'Separadores y cuadrículas' },
  { key: 'fg', label: 'Texto', hint: 'Texto principal' },
  { key: 'muted', label: 'Texto secundario', hint: 'Etiquetas y ayudas' }
]

export const PRESETS = {
  fuego:    { name: 'Fuego',      colors: { accent: '#FFA94D', ok: '#5FD4A8', danger: '#F78C8C', bg: '#13161D', surface: '#1B1F28', surface2: '#242A35', line: '#2F3644', fg: '#EDEFF4', muted: '#8C93A5' } },
  oceano:   { name: 'Océano',     colors: { accent: '#4FC3F7', ok: '#69E0B5', danger: '#FF8A80', bg: '#0E1620', surface: '#15202C', surface2: '#1D2B3A', line: '#2A3B4D', fg: '#E8F1F8', muted: '#86A0B5' } },
  bosque:   { name: 'Bosque',     colors: { accent: '#8BD46E', ok: '#4FD1A5', danger: '#F49A8A', bg: '#10160F', surface: '#171F16', surface2: '#202A1F', line: '#2D392B', fg: '#EBF3E8', muted: '#8FA28A' } },
  neon:     { name: 'Neón',       colors: { accent: '#E2FF3D', ok: '#3DFFB5', danger: '#FF5C8A', bg: '#0B0B0F', surface: '#14141B', surface2: '#1E1E28', line: '#2C2C3A', fg: '#F4F4F8', muted: '#8E8EA3' } },
  lavanda:  { name: 'Lavanda',    colors: { accent: '#B79CFF', ok: '#7EE0C3', danger: '#FF8FA3', bg: '#15131D', surface: '#1D1A28', surface2: '#272335', line: '#352F47', fg: '#F0EDF8', muted: '#9A93AF' } },
  rubi:     { name: 'Rubí',       colors: { accent: '#FF5A5F', ok: '#5FD4A8', danger: '#FFB020', bg: '#170F11', surface: '#211618', surface2: '#2C1E21', line: '#3B292D', fg: '#F7ECEE', muted: '#A88D92' } },
  oro:      { name: 'Oro',        colors: { accent: '#E6C068', ok: '#7CCB9B', danger: '#E88C7D', bg: '#121110', surface: '#1B1A17', surface2: '#25231F', line: '#34312B', fg: '#F2EEE6', muted: '#9C968A' } },
  mono:     { name: 'Monocromo',  colors: { accent: '#F2F2F2', ok: '#BDBDBD', danger: '#FF7A7A', bg: '#0F0F0F', surface: '#181818', surface2: '#222222', line: '#303030', fg: '#F5F5F5', muted: '#8F8F8F' } },
  claro:    { name: 'Claro',      colors: { accent: '#E8711A', ok: '#178A62', danger: '#D23F3F', bg: '#F5F3EF', surface: '#FFFFFF', surface2: '#ECE8E1', line: '#DDD7CD', fg: '#1C1A17', muted: '#6E685E' } },
  cielo:    { name: 'Cielo claro', colors: { accent: '#2563EB', ok: '#15803D', danger: '#DC2626', bg: '#F1F5FA', surface: '#FFFFFF', surface2: '#E3EAF3', line: '#D2DCE8', fg: '#0F1B2D', muted: '#5B6B80' } },
  contraste:{ name: 'Alto contraste', colors: { accent: '#FFD400', ok: '#00F5A0', danger: '#FF4D4D', bg: '#000000', surface: '#0D0D0D', surface2: '#1F1F1F', line: '#5A5A5A', fg: '#FFFFFF', muted: '#CFCFCF' } }
}

export const RADII = {
  recto:   { name: 'Recto',      lg: '4px',  xl: '6px',  '2xl': '8px' },
  normal:  { name: 'Normal',     lg: '8px',  xl: '12px', '2xl': '16px' },
  suave:   { name: 'Muy redondo', lg: '12px', xl: '18px', '2xl': '26px' }
}

export const DEFAULT_THEME = { preset: 'fuego', colors: { ...PRESETS.fuego.colors }, radius: 'normal' }
const STORE_KEY = 'sl:theme'

// ---------- utilidades de color ----------
export const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v)
export function normHex(v) {
  let h = String(v || '').trim().replace(/^#?/, '#')
  if (/^#[0-9a-f]{3}$/i.test(h)) h = '#' + h.slice(1).split('').map(c => c + c).join('')
  return isHex(h) ? h.toUpperCase() : null
}
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const toHex = (r, g, b) => '#' + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('').toUpperCase()
export function luminance(hex) {
  const [r, g, b] = rgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
export function mix(a, b, t) { const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b); return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t) }
export const isLight = (hex) => luminance(hex) > 0.4

function hsl(hex) {
  let [r, g, b] = rgb(hex).map(v => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
function fromHsl(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l)
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return toHex(f(0) * 255, f(8) * 255, f(4) * 255)
}

/** Texto legible sobre el color principal (oscuro o blanco) */
export function inkFor(accent) { return contrast(accent, '#14161C') >= contrast(accent, '#FFFFFF') ? '#14161C' : '#FFFFFF' }

/** Genera una paleta completa y armónica a partir de un solo color */
export function generatePalette(accent, mode = 'dark') {
  const [h, s] = hsl(accent)
  const tint = Math.min(s, 0.35)
  if (mode === 'light') {
    let acc = accent
    for (let i = 0; i < 10 && contrast(acc, '#FFFFFF') < 3; i++) acc = mix(acc, '#000000', 0.12)
    return {
      accent: acc, ok: '#178A62', danger: '#D23F3F',
      bg: fromHsl(h, tint * 0.6, 0.965), surface: '#FFFFFF', surface2: fromHsl(h, tint * 0.5, 0.92),
      line: fromHsl(h, tint * 0.4, 0.85), fg: fromHsl(h, tint * 0.5, 0.11), muted: fromHsl(h, tint * 0.25, 0.42)
    }
  }
  return {
    accent, ok: '#5FD4A8', danger: '#F78C8C',
    bg: fromHsl(h, tint * 0.55, 0.075), surface: fromHsl(h, tint * 0.5, 0.115), surface2: fromHsl(h, tint * 0.45, 0.16),
    line: fromHsl(h, tint * 0.4, 0.22), fg: fromHsl(h, tint * 0.4, 0.94), muted: fromHsl(h, tint * 0.25, 0.6)
  }
}

/** Revisa la legibilidad de las combinaciones importantes */
export function contrastIssues(c) {
  const checks = [
    { a: c.fg, b: c.bg, min: 7, label: 'Texto sobre el fondo' },
    { a: c.fg, b: c.surface, min: 4.5, label: 'Texto sobre las tarjetas' },
    { a: c.muted, b: c.surface, min: 3, label: 'Texto secundario sobre las tarjetas' },
    { a: c.accent, b: c.bg, min: 2.5, label: 'Color principal sobre el fondo' },
    { a: c.ok, b: c.surface, min: 2, label: 'Color de éxito sobre las tarjetas' }
  ]
  return checks.map(x => ({ ...x, ratio: contrast(x.a, x.b) })).filter(x => x.ratio < x.min)
}

// ---------- aplicar y guardar ----------
const channels = (hex) => rgb(hex).join(' ')

export function sanitize(t) {
  const base = PRESETS[t?.preset]?.colors || DEFAULT_THEME.colors
  const colors = {}
  for (const { key } of COLOR_KEYS) colors[key] = normHex(t?.colors?.[key]) || base[key]
  return { preset: t?.preset && (PRESETS[t.preset] || t.preset === 'custom') ? t.preset : 'custom', colors, radius: RADII[t?.radius] ? t.radius : 'normal' }
}

export function applyTheme(theme) {
  const t = sanitize(theme)
  const c = t.colors, root = document.documentElement.style
  for (const { key } of COLOR_KEYS) root.setProperty(`--c-${key}`, channels(c[key]))
  root.setProperty('--c-ink', channels(inkFor(c.accent)))
  root.setProperty('--c-surface3', channels(mix(c.surface2, c.fg, 0.14)))
  root.setProperty('--c-ondark', channels(isLight(c.bg) ? '#FFFFFF' : c.bg))
  const r = RADII[t.radius]
  root.setProperty('--r-lg', r.lg); root.setProperty('--r-xl', r.xl); root.setProperty('--r-2xl', r['2xl'])
  root.colorScheme = isLight(c.bg) ? 'light' : 'dark'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.bg)
  return t
}

export const loadLocalTheme = () => sanitize(load(STORE_KEY, DEFAULT_THEME))
export const saveLocalTheme = (t) => save(STORE_KEY, sanitize(t))

/** Código compacto para compartir un tema */
export function exportCode(t) {
  const s = sanitize(t)
  return 'SL1-' + COLOR_KEYS.map(({ key }) => s.colors[key].slice(1)).join('') + '-' + s.radius
}
export function importCode(code) {
  const m = String(code || '').trim().match(/^SL1-([0-9a-f]{54})-(\w+)$/i)
  if (!m) return null
  const colors = {}
  COLOR_KEYS.forEach(({ key }, i) => { colors[key] = '#' + m[1].slice(i * 6, i * 6 + 6).toUpperCase() })
  return sanitize({ preset: 'custom', colors, radius: m[2] })
}

/** Variable CSS como color usable en estilos en línea (SVG, sombras) */
export const cv = (key, alpha) => alpha == null ? `rgb(var(--c-${key}))` : `rgb(var(--c-${key}) / ${alpha})`
