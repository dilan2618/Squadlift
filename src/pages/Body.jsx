import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PageHeader, LineChart, toast } from '../components/ui'
import { ProgressTabs } from './Progress'
import { localDate, toUnit, fromUnit, friendlyError } from '../lib/utils'

const BUCKET = 'progress-photos'
const fmtDate = (d, o = { day: 'numeric', month: 'short' }) => new Date(d + 'T12:00:00').toLocaleDateString('es', o)

/** Reduce la foto del teléfono a ~1600px JPEG para subir rápido */
async function compress(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82))
    return blob ? { blob, ext: 'jpg', type: 'image/jpeg' } : null
  } catch { return null }
}

export default function Body() {
  const { user, profile } = useAuth()
  const unit = profile.unit
  const [entries, setEntries] = useState(null)
  const [urls, setUrls] = useState({})
  const [form, setForm] = useState({ date: localDate(profile.timezone), weight: '', note: '', file: null })
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [viewer, setViewer] = useState(null)
  const [confirmDel, setConfirmDel] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('body_metrics').select('*').eq('user_id', user.id).order('measured_on').order('created_at')
    setEntries(data || [])
    const paths = (data || []).map(e => e.photo_path).filter(Boolean)
    if (paths.length) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
      setUrls(Object.fromEntries((signed || []).filter(s => s.signedUrl).map(s => [s.path, s.signedUrl])))
    }
  }, [user.id])
  useEffect(() => { load() }, [load])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function pick(e) {
    const f = e.target.files?.[0]; if (!f) return
    if (f.size > 25 * 1024 * 1024) return toast('La foto es demasiado grande', 'err')
    setForm(x => ({ ...x, file: f })); setPreview(URL.createObjectURL(f))
  }

  async function save(e) {
    e.preventDefault()
    const w = parseFloat(String(form.weight).replace(',', '.'))
    if (Number.isNaN(w) && !form.file) return toast('Escribe tu peso o agrega una foto', 'err')
    setBusy(true)
    try {
      let photo_path = null
      if (form.file) {
        const c = await compress(form.file)
        const blob = c?.blob || form.file
        const ext = c?.ext || (form.file.name.split('.').pop() || 'jpg').toLowerCase()
        photo_path = `${user.id}/${form.date}-${Date.now()}.${ext}`
        const { error } = await supabase.storage.from(BUCKET).upload(photo_path, blob, { contentType: c?.type || form.file.type || 'image/jpeg' })
        if (error) throw error
      }
      const { error } = await supabase.from('body_metrics').insert({
        user_id: user.id, measured_on: form.date, photo_path, note: form.note.trim() || null,
        weight_kg: Number.isNaN(w) ? null : Math.round(fromUnit(w, unit) * 100) / 100
      })
      if (error) throw error
      setForm({ date: localDate(profile.timezone), weight: '', note: '', file: null }); setPreview(null)
      toast('Registro guardado'); load()
    } catch (err) { toast(friendlyError(err), 'err') } finally { setBusy(false) }
  }

  async function remove(entry) {
    if (entry.photo_path) await supabase.storage.from(BUCKET).remove([entry.photo_path])
    const { error } = await supabase.from('body_metrics').delete().eq('id', entry.id)
    if (error) return toast(friendlyError(error), 'err')
    setViewer(null); setConfirmDel(false); toast('Registro eliminado'); load()
  }

  if (!entries) return <p className="text-muted">Cargando…</p>
  const weights = entries.filter(e => e.weight_kg != null)
  const recent = weights.slice(-16)
  const photos = entries.filter(e => e.photo_path && urls[e.photo_path]).reverse()
  const last = weights.at(-1), first = weights[0]
  const diff = last && first && last !== first ? toUnit(Number(last.weight_kg) - Number(first.weight_kg), unit) : null

  return (
    <>
      <PageHeader eyebrow="Tu evolución" title="Progreso" />
      <ProgressTabs />

      <section className="card">
        <span className="eyebrow">Peso corporal</span>
        {last ? (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-display font-bold text-[38px] leading-none num">{toUnit(Number(last.weight_kg), unit)}</span><span className="text-muted">{unit}</span>
            {diff != null && <span className="text-[13px] font-bold text-muted">{diff > 0 ? '+' : ''}{diff} {unit} desde {fmtDate(first.measured_on)}</span>}
          </div>
        ) : <p className="text-sm text-muted m-0">Registra tu peso una vez por semana, a la misma hora, para ver la tendencia.</p>}
        {recent.length > 1 && <LineChart data={recent.map(e => toUnit(Number(e.weight_kg), unit))} labels={recent.map(e => fmtDate(e.measured_on))} />}
        <p className="text-xs text-muted m-0">El peso sube y baja a diario por agua y comida. Fíjate en la tendencia de varias semanas, no en un día.</p>
      </section>

      <form onSubmit={save} className="card" noValidate>
        <span className="font-bold">Nuevo registro</span>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label" htmlFor="bw">Peso ({unit})</label>
            <input id="bw" inputMode="decimal" className="field num" placeholder={unit === 'kg' ? '75,5' : '166'} value={form.weight} onChange={e => setForm(x => ({ ...x, weight: e.target.value }))} /></div>
          <div><label className="label" htmlFor="bd">Fecha</label>
            <input id="bd" type="date" className="field" value={form.date} max={localDate(profile.timezone)} onChange={e => setForm(x => ({ ...x, date: e.target.value }))} /></div>
        </div>
        <div><label className="label" htmlFor="bn">Nota (opcional)</label>
          <input id="bn" className="field" maxLength={200} placeholder="En ayunas, después de entrenar…" value={form.note} onChange={e => setForm(x => ({ ...x, note: e.target.value }))} /></div>
        <label className="flex items-center gap-3 bg-surface2 rounded-xl p-3 cursor-pointer">
          {preview ? <img src={preview} alt="" className="w-14 h-14 rounded-lg object-cover" />
            : <span className="w-14 h-14 rounded-lg bg-surface grid place-items-center text-2xl">📷</span>}
          <span className="text-sm"><b>{preview ? 'Cambiar foto' : 'Agregar foto de progreso'}</b><span className="block text-xs text-muted">Privada: solo tú puedes verla</span></span>
          <input type="file" accept="image/*" className="sr-only" onChange={pick} />
        </label>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Guardando…' : 'Guardar registro'}</button>
      </form>

      {photos.length >= 2 && (
        <section className="card">
          <span className="eyebrow">Antes y ahora</span>
          <div className="grid grid-cols-2 gap-2">
            {[photos.at(-1), photos[0]].map((p, i) => (
              <button key={p.id} className="flex flex-col gap-1 text-left" onClick={() => setViewer(p)}>
                <img src={urls[p.photo_path]} alt={i ? 'Ahora' : 'Antes'} className="w-full aspect-[3/4] object-cover rounded-xl" />
                <span className="text-xs text-muted">{i ? 'Ahora' : 'Antes'} · {fmtDate(p.measured_on, { day: 'numeric', month: 'short', year: '2-digit' })}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {photos.length > 0 && (
        <section className="flex flex-col gap-2">
          <span className="eyebrow">Fotos ({photos.length})</span>
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map(p => (
              <button key={p.id} onClick={() => setViewer(p)} className="relative">
                <img src={urls[p.photo_path]} alt={`Foto del ${p.measured_on}`} className="w-full aspect-square object-cover rounded-lg" loading="lazy" />
                <span className="absolute left-1 bottom-1 text-[10px] font-bold bg-bg/80 rounded px-1.5 py-0.5">{fmtDate(p.measured_on)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {weights.length > 0 && (
        <section className="flex flex-col gap-2">
          <span className="eyebrow">Registros de peso</span>
          <div className="bg-surface rounded-2xl divide-y divide-line">
            {[...weights].reverse().slice(0, 12).map(e => (
              <button key={e.id} onClick={() => setViewer(e)} className="w-full flex justify-between items-center gap-3 px-4 py-3 text-left">
                <span className="min-w-0"><span className="block">{fmtDate(e.measured_on, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  {e.note && <span className="block text-xs text-muted truncate">{e.note}</span>}</span>
                <span className="num shrink-0">{toUnit(Number(e.weight_kg), unit)} {unit} {e.photo_path ? '📷' : ''}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {viewer && (
        <div className="fixed inset-0 z-40 bg-bg/95 flex flex-col p-4 gap-3 safe-top" role="dialog" aria-modal="true">
          <div className="flex justify-between items-center max-w-[480px] w-full mx-auto">
            <span className="font-bold">{fmtDate(viewer.measured_on, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <button className="chip" onClick={() => { setViewer(null); setConfirmDel(false) }}>Cerrar</button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center max-w-[480px] w-full mx-auto">
            {viewer.photo_path && urls[viewer.photo_path]
              ? <img src={urls[viewer.photo_path]} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
              : <span className="font-display font-bold text-6xl num">{toUnit(Number(viewer.weight_kg), unit)} <span className="text-2xl text-muted">{unit}</span></span>}
          </div>
          <div className="max-w-[480px] w-full mx-auto flex flex-col gap-2 safe-bottom">
            {viewer.weight_kg != null && viewer.photo_path && <span className="text-center num">{toUnit(Number(viewer.weight_kg), unit)} {unit}</span>}
            {viewer.note && <p className="text-sm text-muted text-center m-0">{viewer.note}</p>}
            {confirmDel
              ? <div className="flex gap-2"><button className="btn-ghost flex-1" onClick={() => setConfirmDel(false)}>Cancelar</button><button className="btn flex-1 bg-danger text-bg" onClick={() => remove(viewer)}>Sí, eliminar</button></div>
              : <button className="text-sm text-danger font-semibold py-2" onClick={() => setConfirmDel(true)}>Eliminar este registro</button>}
          </div>
        </div>
      )}
    </>
  )
}
