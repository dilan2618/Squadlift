import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PageHeader, Empty, LineChart, BarChart } from '../components/ui'
import { toUnit, tons } from '../lib/utils'

export function ProgressTabs() {
  const cls = ({ isActive }) => `flex-1 text-center py-2 rounded-lg text-sm font-bold ${isActive ? 'bg-fg text-bg' : 'text-muted'}`
  return (
    <div className="flex bg-surface2 rounded-xl p-[3px]" role="tablist">
      <NavLink to="/progreso" end className={cls}>Fuerza</NavLink>
      <NavLink to="/progreso/cuerpo" className={cls}>Cuerpo</NavLink>
    </div>
  )
}

const fmtDate = (d, opts = { day: 'numeric', month: 'short' }) => new Date(d + 'T12:00:00').toLocaleDateString('es', opts)

export default function Progress() {
  const { user, profile } = useAuth()
  const unit = profile.unit
  const [rows, setRows] = useState(null)
  const [names, setNames] = useState({})
  const [sel, setSel] = useState(null)
  const [history, setHistory] = useState([])
  const [records, setRecords] = useState([])
  const [showAllPR, setShowAllPR] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [prog, h, pr] = await Promise.all([
        supabase.from('exercise_weekly_progress').select('*').eq('user_id', user.id).order('week_start'),
        supabase.from('workout_sessions')
          .select('id, local_date, routine:routines(name), set_logs(reps, weight_kg, exercise_id, is_warmup)')
          .eq('user_id', user.id).not('ended_at', 'is', null).order('local_date', { ascending: false }).order('started_at', { ascending: false }).limit(30),
        supabase.from('personal_records').select('*').eq('user_id', user.id).order('achieved_on', { ascending: false })
      ])
      const data = prog.data || []
      const ids = [...new Set(data.map(r => r.exercise_id))]
      const { data: ex } = ids.length ? await supabase.from('exercises').select('id, name').in('id', ids) : { data: [] }
      const count = {}; data.forEach(r => { count[r.exercise_id] = (count[r.exercise_id] || 0) + 1 })
      setNames(Object.fromEntries((ex || []).map(e => [e.id, e.name])))
      setRows(data); setSel(ids.sort((a, b) => count[b] - count[a])[0] || null)
      setHistory(h.data || []); setRecords(pr.data || [])
    })()
  }, [user.id])

  const series = useMemo(() => (rows || []).filter(r => r.exercise_id === sel).slice(-12), [rows, sel])
  const ranked = useMemo(() => {
    const c = {}; (rows || []).forEach(r => { c[r.exercise_id] = (c[r.exercise_id] || 0) + 1 })
    return Object.keys(c).sort((a, b) => c[b] - c[a])
  }, [rows])

  if (!rows) return <p className="text-muted">Cargando…</p>
  if (!rows.length) return (
    <>
      <PageHeader eyebrow="Tu evolución" title="Progreso" />
      <ProgressTabs />
      <Empty title="Todavía no hay datos de fuerza" text="Termina tu primer entrenamiento y aquí verás tus récords, tus cargas y tu volumen semana a semana." />
    </>
  )

  const labels = series.map(r => fmtDate(r.week_start))
  const e1 = series.map(r => toUnit(Number(r.est_1rm_kg), unit))
  const vol = series.map(r => Number(r.volume_kg || 0) / 1000)
  const delta = e1.length > 1 ? +(e1.at(-1) - e1[0]).toFixed(1) : 0
  const recent = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
  const prList = showAllPR ? records : records.slice(0, 5)

  return (
    <>
      <PageHeader eyebrow={`Últimas ${series.length} semanas`} title="Progreso" />
      <ProgressTabs />

      <section className="card">
        <div className="flex justify-between items-center"><span className="eyebrow">🏆 Récords personales</span><span className="text-xs text-muted">peso máximo</span></div>
        <div className="flex flex-col divide-y divide-line">
          {prList.map(r => (
            <div key={r.exercise_id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
              <div className="min-w-0">
                <div className="font-semibold truncate">{r.exercise_name}</div>
                <div className="text-xs text-muted">{fmtDate(r.achieved_on)}{r.achieved_on >= recent && <span className="ml-2 text-accent font-bold">NUEVO</span>}</div>
              </div>
              <span className="num text-right shrink-0"><b className="text-lg">{toUnit(Number(r.best_kg), unit)}</b> <span className="text-muted text-xs">{unit} × {r.reps}</span></span>
            </div>
          ))}
        </div>
        {records.length > 5 && <button className="text-sm text-accent font-semibold self-start" onClick={() => setShowAllPR(v => !v)}>{showAllPR ? 'Ver menos' : `Ver los ${records.length}`}</button>}
      </section>

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Ejercicio">
        {ranked.map(id => <button key={id} className={`chip ${id === sel ? 'chip-on' : ''}`} onClick={() => setSel(id)}>{names[id]}</button>)}
      </div>

      <div className="card">
        <span className="eyebrow">1RM estimado (fórmula de Epley)</span>
        <div className="flex items-baseline gap-2">
          <span className="font-display font-bold text-[38px] leading-none num">{e1.at(-1)}</span><span className="text-muted">{unit}</span>
          {e1.length > 1 && <span className={`text-[13px] font-bold ${delta >= 0 ? 'text-ok' : 'text-muted'}`}>{delta >= 0 ? '+' : ''}{delta} {unit}</span>}
        </div>
        <LineChart data={e1} labels={labels} />
      </div>

      <div className="card">
        <span className="eyebrow">Volumen semanal de este ejercicio (toneladas)</span>
        <div className="flex items-baseline gap-2"><span className="font-display font-bold text-[38px] leading-none num">{tons(vol.at(-1) * 1000)}</span><span className="text-muted">t esta semana</span></div>
        <BarChart data={vol} labels={labels} />
        <p className="text-xs text-muted m-0">Una semana más baja de vez en cuando (descarga) ayuda a recuperarte y seguir progresando.</p>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex justify-between items-baseline"><span className="eyebrow">Historial</span><span className="text-xs text-muted">toca para editar</span></div>
        <div className="bg-surface rounded-2xl divide-y divide-line">
          {history.map(s => {
            const v = s.set_logs.filter(x => !x.is_warmup).reduce((a, x) => a + x.reps * Number(x.weight_kg), 0)
            return (
              <Link key={s.id} to={`/historial/${s.id}`} className="flex justify-between items-center gap-3 px-4 py-3 active:bg-surface2">
                <div className="min-w-0"><div className="font-semibold truncate">{s.routine?.name || 'Entrenamiento libre'}</div>
                  <div className="text-xs text-muted">{fmtDate(s.local_date, { weekday: 'short', day: 'numeric', month: 'short' })} · {new Set(s.set_logs.map(x => x.exercise_id)).size} ejercicios · {s.set_logs.length} series</div></div>
                <span className="num text-sm shrink-0 text-muted">{tons(v)} t ›</span>
              </Link>
            )
          })}
        </div>
      </section>
    </>
  )
}
