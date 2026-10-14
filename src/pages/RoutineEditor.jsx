import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PageHeader, toast } from '../components/ui'
import { DAYS_LONG, friendlyError } from '../lib/utils'

export default function RoutineEditor() {
  const { id } = useParams()
  const isNew = id === 'nueva'
  const { user } = useAuth()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [day, setDay] = useState('')
  const [items, setItems] = useState([])
  const [catalog, setCatalog] = useState([])
  const [picker, setPicker] = useState(false)
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('Todos')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [newEx, setNewEx] = useState('')

  useEffect(() => {
    supabase.from('exercises').select('id, name, muscle_group, equipment').order('muscle_group').order('name')
      .then(({ data }) => setCatalog(data || []))
    if (!isNew) {
      supabase.from('routines').select('name, day_of_week, routine_exercises(*, exercise:exercises(id, name, muscle_group))')
        .eq('id', id).single().then(({ data }) => {
          if (!data) return nav('/rutinas')
          setName(data.name); setDay(data.day_of_week ?? '')
          setItems([...data.routine_exercises].sort((a, b) => a.position - b.position).map(r => ({
            key: r.id, exercise: r.exercise, target_sets: r.target_sets, target_reps_min: r.target_reps_min,
            target_reps_max: r.target_reps_max, rest_seconds: r.rest_seconds
          })))
        })
    }
  }, [id, isNew, nav])

  const groups = useMemo(() => ['Todos', ...new Set(catalog.map(c => c.muscle_group))], [catalog])
  const filtered = catalog.filter(c => (group === 'Todos' || c.muscle_group === group) && c.name.toLowerCase().includes(q.toLowerCase()))

  function add(ex) {
    setItems(it => [...it, { key: crypto.randomUUID(), exercise: ex, target_sets: 3, target_reps_min: 8, target_reps_max: 12, rest_seconds: ex.muscle_group === 'Pierna' || ex.muscle_group === 'Espalda' ? 120 : 90 }])
    toast(`${ex.name} añadido`)
  }
  async function createExercise() {
    const n = newEx.trim(); if (n.length < 2) return
    const { data, error } = await supabase.from('exercises')
      .insert({ name: n, muscle_group: group === 'Todos' ? 'Otro' : group, created_by: user.id }).select().single()
    if (error) return toast(friendlyError(error), 'err')
    setCatalog(c => [...c, data]); setNewEx(''); add(data)
  }
  const update = (k, field, v) => setItems(it => it.map(i => i.key === k ? { ...i, [field]: v } : i))
  const move = (idx, dir) => setItems(it => { const a = [...it]; const j = idx + dir; if (j < 0 || j >= a.length) return a; [a[idx], a[j]] = [a[j], a[idx]]; return a })

  async function save() {
    if (!name.trim()) return toast('Ponle un nombre a la rutina', 'err')
    if (!items.length) return toast('Añade al menos un ejercicio', 'err')
    setBusy(true)
    try {
      let rid = id
      const row = { name: name.trim(), day_of_week: day === '' ? null : Number(day) }
      if (isNew) {
        const { data, error } = await supabase.from('routines').insert({ ...row, owner_id: user.id }).select('id').single()
        if (error) throw error
        rid = data.id
      } else {
        const { error } = await supabase.from('routines').update(row).eq('id', id)
        if (error) throw error
        const { error: e2 } = await supabase.from('routine_exercises').delete().eq('routine_id', id)
        if (e2) throw e2
      }
      const rows = items.map((i, n) => ({
        routine_id: rid, exercise_id: i.exercise.id, position: n + 1,
        target_sets: clamp(i.target_sets, 1, 20, 3), target_reps_min: clamp(i.target_reps_min, 1, 100, 8),
        target_reps_max: Math.max(clamp(i.target_reps_max, 1, 100, 12), clamp(i.target_reps_min, 1, 100, 8)),
        rest_seconds: clamp(i.rest_seconds, 0, 900, 90)
      }))
      const { error } = await supabase.from('routine_exercises').insert(rows)
      if (error) throw error
      toast('Rutina guardada'); nav('/rutinas')
    } catch (e) { toast(friendlyError(e), 'err') } finally { setBusy(false) }
  }

  async function archive() {
    const { error } = await supabase.from('routines').update({ archived: true }).eq('id', id)
    if (error) return toast(friendlyError(error), 'err')
    toast('Rutina eliminada'); nav('/rutinas')
  }

  return (
    <>
      <PageHeader eyebrow={isNew ? 'Nueva rutina' : 'Editar rutina'} title={name || 'Sin nombre'}
        right={<button className="chip" onClick={() => nav('/rutinas')}>Cancelar</button>} />

      <div className="card">
        <div><label className="label" htmlFor="rname">Nombre</label>
          <input id="rname" className="field" placeholder="Pierna, Pecho / Tríceps…" value={name} onChange={e => setName(e.target.value)} maxLength={40} /></div>
        <div><label className="label" htmlFor="rday">Día de la semana</label>
          <select id="rday" className="field" value={day} onChange={e => setDay(e.target.value)}>
            <option value="">Sin día fijo</option>
            {DAYS_LONG.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
          </select></div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="eyebrow">Ejercicios ({items.length})</span>
        {items.map((it, idx) => (
          <div key={it.key} className="card gap-2">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0"><div className="font-bold break-words">{idx + 1}. {it.exercise.name}</div><div className="text-xs text-muted">{it.exercise.muscle_group}</div></div>
              <div className="flex gap-1 shrink-0">
                <button className="chip px-2.5" aria-label="Subir" onClick={() => move(idx, -1)}>↑</button>
                <button className="chip px-2.5" aria-label="Bajar" onClick={() => move(idx, 1)}>↓</button>
                <button className="chip px-2.5 text-danger" aria-label="Quitar" onClick={() => setItems(a => a.filter(x => x.key !== it.key))}>✕</button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <NumField label="Series" value={it.target_sets} onChange={v => update(it.key, 'target_sets', v)} />
              <NumField label="Reps mín" value={it.target_reps_min} onChange={v => update(it.key, 'target_reps_min', v)} />
              <NumField label="Reps máx" value={it.target_reps_max} onChange={v => update(it.key, 'target_reps_max', v)} />
              <NumField label="Desc. (s)" value={it.rest_seconds} onChange={v => update(it.key, 'rest_seconds', v)} />
            </div>
          </div>
        ))}
        <button className="btn-ghost w-full" onClick={() => setPicker(p => !p)}>{picker ? 'Cerrar catálogo' : '+ Añadir ejercicio'}</button>
      </div>

      {picker && (
        <div className="card">
          <input className="field" placeholder="Buscar ejercicio" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar ejercicio" />
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {groups.map(g => <button key={g} className={`chip ${g === group ? 'chip-on' : ''}`} onClick={() => setGroup(g)}>{g}</button>)}
          </div>
          <ul className="flex flex-col max-h-80 overflow-y-auto -mx-1">
            {filtered.map(c => (
              <li key={c.id}><button className="w-full flex justify-between gap-2 text-left px-1 py-2.5 border-b border-line" onClick={() => add(c)}>
                <span className="min-w-0">{c.name}<span className="block text-xs text-muted">{c.muscle_group}{c.equipment ? ` · ${c.equipment}` : ''}</span></span>
                <span className="text-accent font-bold">+</span></button></li>
            ))}
            {!filtered.length && <li className="text-sm text-muted py-2">No hay resultados. Créalo abajo.</li>}
          </ul>
          <div className="flex gap-2">
            <input className="field" placeholder="Crear ejercicio propio" value={newEx} onChange={e => setNewEx(e.target.value)} aria-label="Nombre del ejercicio nuevo" />
            <button className="btn-ghost shrink-0" onClick={createExercise}>Crear</button>
          </div>
        </div>
      )}

      <button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar rutina'}</button>
      {!isNew && (confirmDel
        ? <div className="flex gap-2"><button className="btn-ghost flex-1" onClick={() => setConfirmDel(false)}>No</button><button className="btn flex-1 bg-danger text-bg" onClick={archive}>Sí, eliminar</button></div>
        : <button className="text-sm text-danger font-semibold py-2" onClick={() => setConfirmDel(true)}>Eliminar rutina</button>)}
    </>
  )
}

const clamp = (v, lo, hi, def) => { const n = parseInt(v, 10); return Number.isNaN(n) ? def : Math.min(hi, Math.max(lo, n)) }

function NumField({ label, value, onChange }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-muted">
      {label}
      <input inputMode="numeric" className="h-10 w-full rounded-lg bg-surface2 text-center text-fg text-sm num border border-transparent focus:border-accent focus:outline-none"
        value={value} onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))} />
    </label>
  )
}
