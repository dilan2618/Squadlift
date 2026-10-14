import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PageHeader, toast } from '../components/ui'
import { toUnit, fromUnit, tons, friendlyError } from '../lib/utils'

const ENERGY = ['Agotado', 'Cansado', 'Normal', 'Bien', 'Con todo']

export default function SessionDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const unit = profile.unit
  const nav = useNavigate()
  const [s, setS] = useState(null)
  const [groups, setGroups] = useState([])
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [removed, setRemoved] = useState([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  useEffect(() => {
    supabase.from('workout_sessions')
      .select('id, local_date, started_at, ended_at, energy, notes, routine:routines(name), set_logs(id, exercise_id, set_number, reps, weight_kg, exercise:exercises(name))')
      .eq('id', id).maybeSingle()
      .then(({ data }) => {
        if (!data) { toast('No encontramos ese entrenamiento', 'err'); return nav('/progreso') }
        setS(data); setDate(data.local_date); setNotes(data.notes || '')
        const map = new Map()
        for (const l of [...data.set_logs].sort((a, b) => a.set_number - b.set_number)) {
          if (!map.has(l.exercise_id)) map.set(l.exercise_id, { exercise_id: l.exercise_id, name: l.exercise.name, sets: [] })
          map.get(l.exercise_id).sets.push({ id: l.id, w: Number(l.weight_kg), r: l.reps })
        }
        setGroups([...map.values()])
      })
  }, [id, nav])

  function edit(gi, si, field, v) {
    setDirty(true)
    setGroups(gs => gs.map((g, i) => i !== gi ? g : { ...g, sets: g.sets.map((x, j) => j !== si ? x : { ...x, [field]: v }) }))
  }
  function delSet(gi, si) {
    setDirty(true)
    setRemoved(r => [...r, groups[gi].sets[si].id])
    setGroups(gs => gs.map((g, i) => i !== gi ? g : { ...g, sets: g.sets.filter((_, j) => j !== si) }).filter(g => g.sets.length))
  }

  async function save() {
    setBusy(true)
    try {
      if (removed.length) {
        const { error } = await supabase.from('set_logs').delete().in('id', removed)
        if (error) throw error
      }
      // Renumera las series de cada ejercicio y guarda pesos/reps
      for (const g of groups) {
        for (let i = 0; i < g.sets.length; i++) {
          const x = g.sets[i]
          const { error } = await supabase.from('set_logs').update({
            weight_kg: Math.max(0, Number(x.w) || 0), reps: Math.max(0, parseInt(x.r, 10) || 0), set_number: 100 + i
          }).eq('id', x.id)
          if (error) throw error
        }
        for (let i = 0; i < g.sets.length; i++) {
          await supabase.from('set_logs').update({ set_number: i + 1 }).eq('id', g.sets[i].id)
        }
      }
      const { error } = await supabase.from('workout_sessions').update({ local_date: date, notes: notes.trim() || null }).eq('id', id)
      if (error) throw error
      setRemoved([]); setDirty(false); toast('Cambios guardados')
    } catch (e) { toast(friendlyError(e), 'err') } finally { setBusy(false) }
  }

  async function del() {
    setBusy(true)
    const { error } = await supabase.from('workout_sessions').delete().eq('id', id)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'err')
    toast('Entrenamiento eliminado'); nav('/progreso')
  }

  if (!s) return <p className="text-muted">Cargando…</p>
  const vol = groups.reduce((a, g) => a + g.sets.reduce((b, x) => b + (Number(x.w) || 0) * (Number(x.r) || 0), 0), 0)
  const mins = s.ended_at ? Math.round((new Date(s.ended_at) - new Date(s.started_at)) / 60000) : null

  return (
    <>
      <PageHeader eyebrow="Entrenamiento" title={s.routine?.name || 'Entrenamiento libre'}
        right={<button className="chip" onClick={() => nav('/progreso')}>Volver</button>} />

      <div className="bg-surface rounded-2xl p-4 grid grid-cols-3 gap-2">
        <Stat v={groups.length} k="ejercicios" />
        <Stat v={`${tons(vol)} t`} k="volumen" />
        <Stat v={mins != null ? `${mins} min` : '—'} k={s.energy ? ENERGY[s.energy - 1] : 'duración'} />
      </div>

      <div className="card">
        <div><label className="label" htmlFor="sdate">Fecha</label>
          <input id="sdate" type="date" className="field" value={date} onChange={e => { setDate(e.target.value); setDirty(true) }} /></div>
        <div><label className="label" htmlFor="snotes">Notas</label>
          <textarea id="snotes" className="field h-20 py-2.5" maxLength={300} value={notes} placeholder="Cómo te sentiste, molestias, ajustes para la próxima…"
            onChange={e => { setNotes(e.target.value); setDirty(true) }} /></div>
      </div>

      {groups.map((g, gi) => (
        <article key={g.exercise_id} className="bg-surface rounded-2xl px-3.5 pt-3.5 pb-3 flex flex-col gap-2">
          <span className="font-bold">{g.name}</span>
          <div className="grid grid-cols-[26px_1fr_1fr_40px] gap-x-2 gap-y-1.5 items-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">#</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted text-center">{unit}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted text-center">Reps</span>
            <span />
            {g.sets.map((x, si) => [
              <span key={`n${x.id}`} className="num text-muted text-center text-[13px]">{si + 1}</span>,
              <input key={`w${x.id}`} aria-label={`Peso serie ${si + 1}`} inputMode="decimal" className="h-[38px] w-full text-center rounded-lg num bg-surface2 border border-transparent focus:border-accent focus:outline-none"
                value={toUnit(x.w, unit)} onChange={e => { const v = parseFloat(e.target.value.replace(',', '.')); edit(gi, si, 'w', Number.isNaN(v) ? 0 : fromUnit(v, unit)) }} />,
              <input key={`r${x.id}`} aria-label={`Repeticiones serie ${si + 1}`} inputMode="numeric" className="h-[38px] w-full text-center rounded-lg num bg-surface2 border border-transparent focus:border-accent focus:outline-none"
                value={x.r} onChange={e => edit(gi, si, 'r', e.target.value.replace(/[^0-9]/g, ''))} />,
              <button key={`d${x.id}`} aria-label={`Borrar serie ${si + 1}`} onClick={() => delSet(gi, si)} className="h-[38px] w-10 rounded-lg bg-surface2 text-danger font-bold">✕</button>
            ])}
          </div>
        </article>
      ))}
      {!groups.length && <p className="text-sm text-muted m-0">Este entrenamiento ya no tiene series.</p>}

      <button className="btn-primary w-full" disabled={!dirty || busy} onClick={save}>{busy ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Sin cambios'}</button>

      {confirmDel ? (
        <div className="card border border-danger/40">
          <span className="font-bold">¿Eliminar este entrenamiento?</span>
          <p className="text-sm text-muted m-0">Se borran sus series y su publicación en el muro del squad. No se puede deshacer.</p>
          <div className="flex gap-2"><button className="btn-ghost flex-1" onClick={() => setConfirmDel(false)}>Cancelar</button>
            <button className="btn flex-1 bg-danger text-bg" disabled={busy} onClick={del}>Sí, eliminar</button></div>
        </div>
      ) : <button className="text-sm text-danger font-semibold py-2" onClick={() => setConfirmDel(true)}>Eliminar entrenamiento</button>}
    </>
  )
}

const Stat = ({ v, k }) => (
  <div className="flex flex-col gap-0.5 min-w-0"><span className="font-display font-bold text-2xl leading-none num truncate">{v}</span><span className="text-[11px] text-muted truncate">{k}</span></div>
)
