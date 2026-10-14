import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PageHeader, Ring, LineChart, toast } from '../components/ui'
import {
  COLOR_KEYS, PRESETS, RADII, DEFAULT_THEME, applyTheme, sanitize, loadLocalTheme, saveLocalTheme,
  generatePalette, contrastIssues, exportCode, importCode, normHex, isLight, cv
} from '../lib/theme'
import { friendlyError } from '../lib/utils'

export default function Appearance() {
  const { user, refreshProfile } = useAuth()
  const nav = useNavigate()
  const savedRef = useRef(loadLocalTheme())
  const [theme, setTheme] = useState(savedRef.current)
  const [seed, setSeed] = useState(savedRef.current.colors.accent)
  const [seedMode, setSeedMode] = useState(isLight(savedRef.current.colors.bg) ? 'light' : 'dark')
  const [hexDraft, setHexDraft] = useState({})
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState('presets')
  const dirtyRef = useRef(false)

  // Vista previa en vivo en toda la app
  useEffect(() => { applyTheme(theme) }, [theme])
  // Si sales sin guardar, vuelve el tema guardado
  useEffect(() => () => { if (dirtyRef.current) applyTheme(savedRef.current) }, [])

  const dirty = JSON.stringify(sanitize(theme)) !== JSON.stringify(sanitize(savedRef.current))
  dirtyRef.current = dirty
  const issues = useMemo(() => contrastIssues(theme.colors), [theme.colors])

  const update = (patch) => setTheme(t => sanitize({ ...t, ...patch }))
  const setColor = (key, hex) => update({ preset: 'custom', colors: { ...theme.colors, [key]: hex } })

  function choosePreset(id) {
    update({ preset: id, colors: { ...PRESETS[id].colors } })
    setSeed(PRESETS[id].colors.accent); setSeedMode(isLight(PRESETS[id].colors.bg) ? 'light' : 'dark')
  }
  function generate(mode = seedMode) { update({ preset: 'custom', colors: generatePalette(seed, mode) }) }

  async function saveTheme() {
    setBusy(true)
    const t = sanitize(theme)
    saveLocalTheme(t)
    const { error } = await supabase.from('profiles').update({ theme: t }).eq('id', user.id)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'err')
    savedRef.current = t; dirtyRef.current = false; setTheme({ ...t })
    refreshProfile(); toast('Tema guardado en todos tus dispositivos')
  }
  function resetDefault() { choosePreset(DEFAULT_THEME.preset); update({ radius: 'normal' }) }

  async function copyCode() {
    const c = exportCode(theme)
    try { await navigator.clipboard.writeText(c); toast('Código copiado. Pásalo a tu squad.') }
    catch { setCode(c); toast('Copia el código del campo de abajo') }
  }
  function applyCode() {
    const t = importCode(code)
    if (!t) return toast('Ese código no es válido. Debe empezar por SL1-', 'err')
    setTheme(t); setCode(''); toast('Tema aplicado. Toca Guardar para quedártelo.')
  }

  return (
    <>
      <PageHeader eyebrow="Perfil" title="Apariencia" right={<button className="chip" onClick={() => nav('/perfil')}>Volver</button>} />

      {/* Vista previa con componentes reales */}
      <div className="bg-surface rounded-2xl p-4 flex flex-col gap-3 border border-line">
        <div className="flex items-center gap-4">
          <Ring value={3} max={4} size={84}><span className="font-display font-bold text-2xl leading-none">3/4</span></Ring>
          <div className="flex flex-col gap-1.5 min-w-0">
            <span className="eyebrow">Vista previa</span>
            <span className="font-display font-bold uppercase text-2xl leading-none">Hoy toca pierna</span>
            <span className="text-xs text-muted">Así se verá tu app</span>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <span className="chip chip-on">Seleccionado</span><span className="chip">Normal</span>
          <span className="chip bg-ok/15 text-ok">Entrenó</span><span className="chip bg-danger/15 text-danger">Alerta</span>
        </div>
        <div className="grid grid-cols-[1fr_64px_52px_40px] gap-2 items-center">
          <span className="text-xs text-muted num">80 kg × 8</span>
          <span className="h-9 rounded-lg bg-ok/15 grid place-items-center num text-sm">82,5</span>
          <span className="h-9 rounded-lg bg-surface2 grid place-items-center num text-sm">8</span>
          <span className="h-9 w-10 rounded-lg bg-ok text-bg grid place-items-center font-bold">✓</span>
        </div>
        <LineChart data={[92, 95, 94, 98, 101, 103]} labels={['S1', 'S2', 'S3', 'S4', 'S5', 'S6']} />
        <div className="flex gap-2"><button className="btn-primary flex-1 min-h-[42px]">Botón principal</button><button className="btn-ghost flex-1 min-h-[42px]">Secundario</button></div>
      </div>

      <div className={`rounded-xl px-3.5 py-2.5 text-sm ${issues.length ? 'bg-danger/15' : 'bg-ok/15'}`}>
        {issues.length ? (
          <><b className="text-danger">Cuidado con la legibilidad</b>
            <ul className="m-0 mt-1 pl-4 text-muted">{issues.map(i => <li key={i.label}>{i.label}: contraste {i.ratio.toFixed(1)} (recomendado {i.min}+)</li>)}</ul></>
        ) : <b className="text-ok">✓ Todo se lee bien con estos colores</b>}
      </div>

      <Section open={open} setOpen={setOpen} id="presets" title="Temas listos">
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(PRESETS).map(([id, p]) => (
            <button key={id} onClick={() => choosePreset(id)} aria-pressed={theme.preset === id}
              className={`rounded-xl p-2 flex flex-col gap-1.5 text-left border-2 ${theme.preset === id ? 'border-accent' : 'border-transparent'}`}
              style={{ background: p.colors.bg }}>
              <span className="flex gap-1">
                {[p.colors.accent, p.colors.ok, p.colors.surface2].map((c, i) => <span key={i} className="w-4 h-4 rounded-full" style={{ background: c, boxShadow: `0 0 0 1px ${p.colors.line}` }} />)}
              </span>
              <span className="h-2 rounded-full w-3/4" style={{ background: p.colors.surface }} />
              <span className="text-[11px] font-bold truncate" style={{ color: p.colors.fg }}>{p.name}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section open={open} setOpen={setOpen} id="generate" title="Crear desde un color">
        <p className="text-sm text-muted m-0">Elige tu color favorito y generamos un tema completo que combine.</p>
        <div className="flex items-center gap-3">
          <input type="color" value={seed} onChange={e => setSeed(e.target.value.toUpperCase())} aria-label="Color base" className="w-14 h-14 rounded-xl bg-transparent border-0 p-0 cursor-pointer" />
          <input className="field num uppercase" value={seed} maxLength={7} aria-label="Código del color base"
            onChange={e => { const h = normHex(e.target.value); setSeed(h || e.target.value) }} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[['dark', '🌙 Oscuro'], ['light', '☀️ Claro']].map(([m, l]) => (
            <button key={m} onClick={() => setSeedMode(m)} className={`h-10 rounded-lg font-semibold ${seedMode === m ? 'bg-accent text-ink' : 'bg-surface2 text-muted'}`}>{l}</button>
          ))}
        </div>
        <button className="btn-primary w-full" disabled={!normHex(seed)} onClick={() => generate()}>Generar tema</button>
      </Section>

      <Section open={open} setOpen={setOpen} id="custom" title="Ajustar cada color">
        <p className="text-sm text-muted m-0">Toca el círculo para elegir con la rueda, o escribe el código del color.</p>
        <div className="flex flex-col divide-y divide-line">
          {COLOR_KEYS.map(({ key, label, hint }) => {
            const val = theme.colors[key]
            const draft = hexDraft[key] ?? val
            return (
              <div key={key} className="flex items-center gap-3 py-2.5">
                <label className="relative w-10 h-10 rounded-full shrink-0 cursor-pointer" style={{ background: val, boxShadow: `0 0 0 2px ${cv('line')}` }}>
                  <input type="color" value={val} onChange={e => { setColor(key, e.target.value.toUpperCase()); setHexDraft(d => ({ ...d, [key]: undefined })) }}
                    className="absolute inset-0 opacity-0 cursor-pointer" aria-label={label} />
                </label>
                <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{label}</div><div className="text-xs text-muted truncate">{hint}</div></div>
                <input value={draft} maxLength={7} aria-label={`Código de ${label}`}
                  className="w-[92px] h-9 rounded-lg bg-surface2 text-center num text-sm uppercase border border-transparent focus:border-accent focus:outline-none"
                  onChange={e => {
                    const v = e.target.value; setHexDraft(d => ({ ...d, [key]: v }))
                    const h = normHex(v); if (h && h.length === 7 && v.replace('#', '').length === 6) setColor(key, h)
                  }}
                  onBlur={() => setHexDraft(d => ({ ...d, [key]: undefined }))} />
              </div>
            )
          })}
        </div>
      </Section>

      <Section open={open} setOpen={setOpen} id="shape" title="Esquinas">
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(RADII).map(([id, r]) => (
            <button key={id} onClick={() => update({ radius: id })} aria-pressed={theme.radius === id}
              className={`h-16 flex flex-col items-center justify-center gap-1.5 text-xs font-semibold border-2 ${theme.radius === id ? 'border-accent text-fg' : 'border-transparent text-muted'} bg-surface2`}
              style={{ borderRadius: r.xl }}>
              <span className="w-8 h-5 border-2 border-current" style={{ borderRadius: r.lg }} />{r.name}
            </button>
          ))}
        </div>
      </Section>

      <Section open={open} setOpen={setOpen} id="share" title="Compartir tema">
        <p className="text-sm text-muted m-0">Copia el código de tu tema para que tu squad lo use, o pega el de alguien más.</p>
        <div className="flex items-center gap-2 bg-surface2 rounded-xl px-3 py-2">
          <span className="num text-xs break-all flex-1 select-all">{exportCode(theme)}</span>
          <button className="chip chip-on shrink-0" onClick={copyCode}>Copiar</button>
        </div>
        <div className="flex gap-2">
          <input className="field num text-sm" placeholder="Pega aquí un código SL1-…" value={code} onChange={e => setCode(e.target.value)} aria-label="Código de tema" autoCapitalize="none" />
          <button className="btn-ghost shrink-0" disabled={!code.trim()} onClick={applyCode}>Aplicar</button>
        </div>
      </Section>

      <div className="flex flex-col gap-2">
        <button className="btn-primary w-full" disabled={!dirty || busy} onClick={saveTheme}>{busy ? 'Guardando…' : dirty ? 'Guardar tema' : 'Tema guardado'}</button>
        {dirty && <button className="btn-ghost w-full" onClick={() => setTheme(savedRef.current)}>Deshacer cambios</button>}
        <button className="text-sm text-muted py-2" onClick={resetDefault}>Volver al tema original (Fuego)</button>
      </div>
    </>
  )
}

// Fuera del componente para que los campos no pierdan el foco al escribir
function Section({ id, title, open, setOpen, children }) {
  return (
    <section className="bg-surface rounded-2xl">
      <button className="w-full flex justify-between items-center px-4 py-3.5 font-bold" aria-expanded={open === id} onClick={() => setOpen(o => o === id ? null : id)}>
        {title}<span className={`text-muted transition ${open === id ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {open === id && <div className="px-4 pb-4 flex flex-col gap-3">{children}</div>}
    </section>
  )
}
