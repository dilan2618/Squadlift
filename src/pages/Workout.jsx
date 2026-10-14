import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { toast } from '../components/ui'
import { localDate, toUnit, fromUnit, fmtTime, friendlyError, tons } from '../lib/utils'
import { load, save, remove } from '../lib/storage'

const DRAFT_KEY = id => `sl:workout:${id}`

export default function Workout() {
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [session, setSession] = useState(null)
  const [routineName, setRoutineName] = useState('')
  const [blocks, setBlocks] = useState(null)
  const [unit, setUnit] = useState(profile.unit)
  const [catalog, setCatalog] = useState([])
  const [adding, setAdding] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [energy, setEnergy] = useState(null)
  const [busy, setBusy] = useState(false)
  const [rest, setRest] = useState(null) // { left, label }
  const [records, setRecords] = useState(null)
  const restRef = useRef(null)

  // ---------- carga / creación de la sesión ----------
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        let { data: open } = await supabase.from('workout_sessions').select('*').eq('user_id', user.id)
          .is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle()
        const wanted = params.get('rutina')
        if (!open) {
          if (!wanted) { nav('/rutinas', { replace: true }); return }
          const { data, error } = await supabase.from('workout_sessions')
            .insert({ user_id: user.id, routine_id: wanted, local_date: localDate(profile.timezone) }).select().single()
          if (error) throw error
          open = data
        } else if (wanted && wanted !== open.routine_id) {
          toast('Termina o descarta la sesión abierta antes de empezar otra', 'err')
        }
        let template = []
        if (open.routine_id) {
          const { data: r } = await supabase.from('routines')
            .select('name, routine_exercises(*, exercise:exercises(id, name, muscle_group))').eq('id', open.routine_id).maybeSingle()
          if (r) { setRoutineName(r.name); template = [...r.routine_exercises].sort((a, b) => a.position - b.position) }
        } else setRoutineName('Entrenamiento libre')

        const { data: logged } = await supabase.from('set_logs').select('*, exercise:exercises(id, name, muscle_group)')
          .eq('session_id', open.id).order('set_number')
        const exIds = [...new Set([...template.map(t => t.exercise.id), ...(logged || []).map(l => l.exercise_id)])]
        const prev = await previousSets(user.id, exIds, open.id)

        const out = template.map(t => ({
          exercise: t.exercise, reps: t.target_reps_min === t.target_reps_max ? `${t.target_reps_min}` : `${t.target_reps_min}–${t.target_reps_max}`,
          rest: t.rest_seconds, prev: prev[t.exercise.id] || [],
          sets: Array.from({ length: t.target_sets }, (_, i) => {
            const p = prev[t.exercise.id]?.[i] || prev[t.exercise.id]?.at(-1)
            return { w: p ? Number(p.weight_kg) : '', r: p ? p.reps : t.target_reps_min, done: false }
          })
        }))
        // Si el móvil recargó la página, recupera lo que estabas escribiendo
        const draft = load(DRAFT_KEY(open.id))
        if (draft?.blocks?.length) {
          out.length = 0
          draft.blocks.forEach(b => out.push({ ...b, prev: prev[b.exercise.id] || b.prev || [], sets: b.sets.map(s => ({ ...s, done: false })) }))
        }
        for (const l of logged || []) {
          let b = out.find(x => x.exercise.id === l.exercise_id)
          if (!b) { b = { exercise: l.exercise, reps: '', rest: 90, prev: prev[l.exercise_id] || [], sets: [] }; out.push(b) }
          while (b.sets.length < l.set_number) b.sets.push({ w: '', r: '', done: false })
          b.sets[l.set_number - 1] = { w: Number(l.weight_kg), r: l.reps, done: true }
        }
        if (alive) {
          setSession(open); setBlocks(out)
          if (draft?.rest && draft.rest.end > Date.now()) startRest(Math.round((draft.rest.end - Date.now()) / 1000), draft.rest.label)
        }
      } catch (e) { toast(friendlyError(e), 'err'); nav('/') }
    })()
    supabase.from('exercises').select('id, name, muscle_group').order('name').then(({ data }) => setCatalog(data || []))
    return () => { alive = false }
  }, [user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Guarda el borrador (pesos escritos, series añadidas y descanso) en el teléfono
  useEffect(() => {
    if (!session || !blocks) return
    save(DRAFT_KEY(session.id), {
      blocks: blocks.map(b => ({ exercise: b.exercise, reps: b.reps, rest: b.rest, sets: b.sets })),
      rest: rest ? { end: rest.end, label: rest.label } : null
    })
  }, [session, blocks, rest])

  // Mantener la pantalla encendida durante la sesión. El navegador suelta el bloqueo
  // al pasar a segundo plano, así que se vuelve a pedir al regresar.
  useEffect(() => {
    let lock = null
    const acquire = () => {
      if (document.visibilityState !== 'visible' || !navigator.wakeLock) return
      navigator.wakeLock.request('screen').then(l => { lock = l }).catch(() => {})
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => { document.removeEventListener('visibilitychange', acquire); lock?.release?.().catch(() => {}) }
  }, [])

  // Al volver a la app, el temporizador se recalcula con la hora real
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState !== 'visible') return
      setRest(r => {
        if (!r) return r
        const left = Math.round((r.end - Date.now()) / 1000)
        return left > 0 ? { ...r, left } : null
      })
    }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])

  // ---------- temporizador de descanso ----------
  const stopRest = useCallback(() => { clearInterval(restRef.current); setRest(null) }, [])
  function startRest(seconds, label) {
    clearInterval(restRef.current)
    const end = Date.now() + seconds * 1000
    setRest({ end, left: seconds, label })
    restRef.current = setInterval(() => {
      setRest(r => {
        if (!r) return r
        const left = Math.round((r.end - Date.now()) / 1000)
        if (left <= 0) { clearInterval(restRef.current); navigator.vibrate?.([200, 100, 200]); toast('Descanso terminado. ¡A la siguiente serie!'); return null }
        return { ...r, left }
      })
    }, 500)
  }
  useEffect(() => () => clearInterval(restRef.current), [])

  // ---------- series ----------
  const setField = (bi, si, field, v) => setBlocks(bs => bs.map((b, i) => i !== bi ? b : { ...b, sets: b.sets.map((s, j) => j !== si ? s : { ...s, [field]: v }) }))

  async function saveSet(bi, si, s) {
    const b = blocks[bi]
    const { error } = await supabase.from('set_logs').upsert({
      session_id: session.id, exercise_id: b.exercise.id, set_number: si + 1,
      reps: Math.max(0, parseInt(s.r, 10) || 0), weight_kg: Math.max(0, Number(s.w) || 0), rest_seconds: b.rest
    }, { onConflict: 'session_id,exercise_id,set_number' })
    if (error) throw error
  }

  async function toggle(bi, si) {
    const b = blocks[bi], s = b.sets[si]
    const done = !s.done
    setField(bi, si, 'done', done)
    try {
      if (done) {
        await saveSet(bi, si, s)
        const nextSet = b.sets.findIndex((x, j) => j !== si && !x.done)
        const nextB = blocks.slice(bi + 1).find(x => x.sets.some(y => !y.done))
        startRest(b.rest, nextSet >= 0 ? `${b.exercise.name}, serie ${nextSet + 1}` : nextB ? nextB.exercise.name : 'terminar')
      } else {
        await supabase.from('set_logs').delete().match({ session_id: session.id, exercise_id: b.exercise.id, set_number: si + 1 })
      }
    } catch (e) { setField(bi, si, 'done', !done); toast(friendlyError(e), 'err') }
  }

  function onBlur(bi, si) {
    const s = blocks[bi].sets[si]
    if (s.done) saveSet(bi, si, s).catch(e => toast(friendlyError(e), 'err'))
  }

  function addSet(bi) {
    setBlocks(bs => bs.map((b, i) => i !== bi ? b : { ...b, sets: [...b.sets, { ...(b.sets.at(-1) || { w: '', r: 10 }), done: false }] }))
  }
  function addExercise(ex) {
    setBlocks(bs => [...bs, { exercise: ex, reps: '', rest: 90, prev: [], sets: [{ w: '', r: 10, done: false }, { w: '', r: 10, done: false }, { w: '', r: 10, done: false }] }])
    setAdding(false)
  }

  // ---------- terminar ----------
  async function finish() {
    setBusy(true)
    const { error } = await supabase.from('workout_sessions').update({ ended_at: new Date().toISOString(), energy }).eq('id', session.id)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'err')
    remove(DRAFT_KEY(session.id))
    stopRest()
    const { data: prs } = await supabase.rpc('session_prs', { p_session: session.id })
    if (prs?.length) { navigator.vibrate?.([80, 60, 80, 60, 200]); setRecords(prs) }
    else { toast('Entrenamiento guardado. Tu squad ya lo sabe.'); nav('/') }
  }
  async function discard() {
    setBusy(true)
    await supabase.from('workout_sessions').delete().eq('id', session.id)
    remove(DRAFT_KEY(session.id))
    stopRest(); nav('/')
  }

  if (records) return (
    <div className="min-h-[70dvh] flex flex-col justify-center gap-6">
      <div className="flex flex-col gap-2 items-center text-center">
        <span className="text-6xl" aria-hidden="true">🏆</span>
        <span className="eyebrow text-accent">Entrenamiento guardado</span>
        <h1 className="h1 text-[40px]">{records.length === 1 ? '¡Nuevo récord!' : `¡${records.length} récords nuevos!`}</h1>
        <p className="text-muted m-0">Tu squad ya lo sabe.</p>
      </div>
      <div className="card">
        {records.map(r => (
          <div key={r.exercise_id} className="flex justify-between items-center gap-3">
            <span className="font-semibold min-w-0 truncate">{r.exercise_name}</span>
            <span className="num shrink-0 text-right"><b className="text-accent text-lg">{toUnit(Number(r.best_kg), unit)} {unit}</b> × {r.reps}
              <span className="block text-xs text-muted">antes {toUnit(Number(r.prev_best_kg), unit)} {unit}</span></span>
          </div>
        ))}
      </div>
      <button className="btn-primary w-full" onClick={() => nav('/')}>Listo</button>
    </div>
  )

  if (!blocks) return <div className="text-muted py-10 text-center">Preparando tu sesión…</div>

  const total = blocks.reduce((a, b) => a + b.sets.length, 0)
  const doneN = blocks.reduce((a, b) => a + b.sets.filter(s => s.done).length, 0)
  const pct = total ? Math.round(doneN / total * 100) : 0
  const vol = blocks.reduce((a, b) => a + b.sets.filter(s => s.done).reduce((c, s) => c + (Number(s.w) || 0) * (Number(s.r) || 0), 0), 0)

  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="eyebrow">Sesión en curso</span>
          <h1 className="h1 break-words">{routineName}</h1>
        </div>
        <div className="flex bg-surface2 rounded-xl p-[3px] shrink-0" role="group" aria-label="Unidad de peso">
          {['kg', 'lb'].map(u => (
            <button key={u} aria-pressed={unit === u} onClick={() => setUnit(u)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold ${unit === u ? 'bg-fg text-bg' : 'text-muted'}`}>{u}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-[13px]"><span className="text-muted">{doneN} de {total} series · {tons(vol)} t</span><span className="num">{pct}%</span></div>
        <div className="h-1.5 bg-surface2 rounded-full overflow-hidden"><div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
      </div>

      {blocks.map((b, bi) => (
        <article key={b.exercise.id + bi} className="bg-surface rounded-2xl px-3.5 pt-3.5 pb-2.5 flex flex-col gap-2">
          <div className="flex justify-between items-baseline gap-2">
            <span className="font-bold min-w-0 break-words">{b.exercise.name}</span>
            <span className="text-xs text-muted shrink-0">{b.reps && `${b.sets.length}×${b.reps} · `}desc. {fmtTime(b.rest)}</span>
          </div>
          <div className="grid grid-cols-[26px_1fr_64px_52px_40px] gap-x-2 gap-y-1.5 items-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">#</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Anterior</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted text-center">{unit}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted text-center">Reps</span>
            <span />
            {b.sets.map((s, si) => {
              const p = b.prev[si]
              const inCls = `h-[38px] w-full text-center rounded-lg num border border-transparent focus:border-accent focus:outline-none ${s.done ? 'bg-ok/15' : 'bg-surface2'}`
              return [
                <span key={`n${si}`} className="num text-muted text-center text-[13px]">{si + 1}</span>,
                <span key={`p${si}`} className="num text-xs text-muted truncate">{p ? `${toUnit(Number(p.weight_kg), unit)} × ${p.reps}` : '—'}</span>,
                <input key={`w${si}`} aria-label={`Peso serie ${si + 1}`} inputMode="decimal" className={inCls}
                  value={s.w === '' ? '' : toUnit(s.w, unit)} placeholder="0"
                  onChange={e => { const v = parseFloat(e.target.value.replace(',', '.')); setField(bi, si, 'w', Number.isNaN(v) ? '' : fromUnit(v, unit)) }}
                  onBlur={() => onBlur(bi, si)} />,
                <input key={`r${si}`} aria-label={`Repeticiones serie ${si + 1}`} inputMode="numeric" className={inCls}
                  value={s.r} onChange={e => setField(bi, si, 'r', e.target.value.replace(/[^0-9]/g, ''))} onBlur={() => onBlur(bi, si)} />,
                <button key={`c${si}`} aria-label={`Marcar serie ${si + 1}`} aria-pressed={s.done} onClick={() => toggle(bi, si)}
                  className={`h-[38px] w-10 rounded-lg grid place-items-center ${s.done ? 'bg-ok text-bg' : 'bg-surface2 text-muted'}`}>
                  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </button>
              ]
            })}
          </div>
          <button className="text-[13px] font-semibold text-accent self-start pt-1.5" onClick={() => addSet(bi)}>+ Añadir serie</button>
        </article>
      ))}

      {adding ? (
        <div className="card">
          <select className="field" defaultValue="" aria-label="Ejercicio para añadir"
            onChange={e => { const ex = catalog.find(c => c.id === e.target.value); if (ex) addExercise(ex) }}>
            <option value="" disabled>Elige un ejercicio</option>
            {catalog.map(c => <option key={c.id} value={c.id}>{c.name} · {c.muscle_group}</option>)}
          </select>
          <button className="text-sm text-muted" onClick={() => setAdding(false)}>Cancelar</button>
        </div>
      ) : <button className="btn-ghost w-full" onClick={() => setAdding(true)}>+ Añadir ejercicio</button>}

      {finishing ? (
        <div className="card">
          <span className="font-bold">¿Cómo te sentiste hoy?</span>
          <div className="grid grid-cols-5 gap-2">
            {['Agotado', 'Cansado', 'Normal', 'Bien', 'Con todo'].map((l, i) => (
              <button key={l} onClick={() => setEnergy(i + 1)}
                className={`rounded-xl py-2 text-[11px] font-semibold ${energy === i + 1 ? 'bg-accent text-ink' : 'bg-surface2 text-muted'}`}>{l}</button>
            ))}
          </div>
          {doneN === 0 && <p className="text-sm text-danger m-0">No marcaste ninguna serie. Puedes descartar la sesión.</p>}
          <button className="btn-primary w-full" disabled={busy || doneN === 0} onClick={finish}>Guardar y compartir con el squad</button>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setFinishing(false)}>Seguir entrenando</button>
            <button className="btn flex-1 bg-danger/15 text-danger" disabled={busy} onClick={discard}>Descartar sesión</button>
          </div>
        </div>
      ) : (
        <>
          <button className="btn-primary w-full" onClick={() => setFinishing(true)}>Terminar entrenamiento</button>
          <button className="text-sm text-muted py-1" onClick={() => nav('/')}>Salir sin terminar (la sesión queda abierta)</button>
        </>
      )}

      {rest && (
        <div className="fixed inset-x-0 z-20 px-4" style={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
          <div className="max-w-[448px] mx-auto bg-fg text-bg rounded-2xl pl-4 pr-3 py-2.5 flex items-center gap-3 shadow-2xl" role="timer" aria-live="polite">
            <span className="num text-2xl font-semibold">{fmtTime(rest.left)}</span>
            <span className="text-xs font-semibold flex-1 min-w-0 truncate">Descanso · sigue {rest.label}</span>
            <button className="bg-black/10 rounded-lg px-2.5 py-2 text-[13px] font-bold" onClick={() => setRest(r => r && { ...r, end: r.end + 15000, left: r.left + 15 })}>+15s</button>
            <button className="bg-black/10 rounded-lg px-2.5 py-2 text-[13px] font-bold" onClick={stopRest}>Saltar</button>
          </div>
        </div>
      )}
    </>
  )
}

/** Series de la última sesión terminada de cada ejercicio */
async function previousSets(uid, exIds, currentSession) {
  if (!exIds.length) return {}
  const { data } = await supabase.from('set_logs')
    .select('exercise_id, set_number, reps, weight_kg, session_id, completed_at, workout_sessions!inner(user_id, ended_at)')
    .eq('workout_sessions.user_id', uid).not('workout_sessions.ended_at', 'is', null)
    .neq('session_id', currentSession).in('exercise_id', exIds)
    .order('completed_at', { ascending: false }).limit(400)
  const out = {}, lastSession = {}
  for (const s of data || []) {
    lastSession[s.exercise_id] ??= s.session_id
    if (s.session_id !== lastSession[s.exercise_id]) continue
    ;(out[s.exercise_id] ??= []).push(s)
  }
  for (const k in out) out[k].sort((a, b) => a.set_number - b.set_number)
  return out
}
