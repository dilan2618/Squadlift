import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Avatar, Ring } from '../components/ui'
import { cv } from '../lib/theme'
import { DAYS_SHORT, DAYS_LONG, localDate, isoDay, weekStart, addDays, weekStreak, tons } from '../lib/utils'

export default function Today() {
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const today = localDate(profile.timezone)
  const ws = weekStart(today)
  const [d, setD] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [sessions, weeks, routines, squads] = await Promise.all([
        supabase.from('workout_sessions').select('id, local_date, ended_at, routine_id, set_logs(exercise_id, reps, weight_kg, is_warmup)')
          .eq('user_id', user.id).gte('local_date', ws).order('started_at', { ascending: false }),
        supabase.from('weekly_training_days').select('week_start, days_trained').eq('user_id', user.id)
          .order('week_start', { ascending: false }).limit(60),
        supabase.from('routines').select('id, name, day_of_week, routine_exercises(count)')
          .eq('owner_id', user.id).eq('archived', false).order('created_at'),
        supabase.from('squad_members').select('squad:squads(id, name)').eq('user_id', user.id)
      ])
      let attendance = []
      const firstSquad = squads.data?.[0]?.squad
      if (firstSquad) {
        const [att, mem] = await Promise.all([
          supabase.from('squad_attendance_today').select('user_id, trained_today').eq('squad_id', firstSquad.id),
          supabase.from('squad_members').select('profile:profiles(id, display_name, avatar_url)').eq('squad_id', firstSquad.id)
        ])
        const t = new Map((att.data || []).map(a => [a.user_id, a.trained_today]))
        attendance = (mem.data || []).map(m => ({ ...m.profile, trained: !!t.get(m.profile.id) }))
      }
      if (alive) setD({
        sessions: sessions.data || [], weeks: weeks.data || [], routines: routines.data || [],
        squad: firstSquad, attendance
      })
    })()
    return () => { alive = false }
  }, [user.id, ws])

  if (!d) return <div className="text-muted py-10 text-center">Cargando tu semana…</div>

  const done = d.sessions.filter(s => s.ended_at)
  const daysSet = new Set(done.map(s => s.local_date))
  const goal = profile.weekly_goal_days
  const daysDone = daysSet.size
  const met = daysDone >= goal
  const trainedToday = daysSet.has(today)
  const active = d.sessions.find(s => !s.ended_at)
  const streak = weekStreak(d.weeks, goal, today)
  const todayRoutine = d.routines.find(r => r.day_of_week === isoDay(today))
  const sets = done.flatMap(s => s.set_logs)
  const volume = sets.filter(s => !s.is_warmup).reduce((a, s) => a + s.reps * Number(s.weight_kg), 0)
  const exCount = new Set(sets.map(s => s.exercise_id)).size
  const left = goal - daysDone
  const firstName = profile.display_name.split(' ')[0]
  const dateLabel = new Date(today + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })

  function start(routineId) { nav(`/entrenar/sesion${routineId ? `?rutina=${routineId}` : ''}`) }

  return (
    <>
      <header className="flex items-center justify-between">
        <div className="font-display font-bold uppercase text-[26px] tracking-wide">Squad<span className="text-accent">Lift</span></div>
        <Link to="/perfil" aria-label="Perfil"><Avatar profile={profile} /></Link>
      </header>

      <div className="flex flex-col gap-1">
        <span className="eyebrow first-letter:uppercase">{dateLabel}</span>
        <h1 className="h1">{active ? 'Sesión en curso' : trainedToday ? `Bien hecho, ${firstName}` : todayRoutine ? `Hoy toca ${todayRoutine.name}` : `Hola, ${firstName}`}</h1>
      </div>

      <section className="grid grid-cols-[132px_1fr] gap-5 items-center">
        <Ring value={daysDone} max={goal} color={met ? cv('ok') : cv('accent')}>
          <span className="font-display font-bold text-[40px] leading-none">{daysDone}/{goal}</span>
          <small className="text-[11px] text-muted">días esta semana</small>
        </Ring>
        <div className="flex flex-col gap-2 min-w-0">
          <span className="eyebrow">Racha semanal</span>
          <span className="font-display font-bold text-3xl leading-none">{streak} {streak === 1 ? 'semana' : 'semanas'}</span>
          <p className="text-[13px] text-muted m-0">
            {met ? 'Meta de la semana cumplida. Descansar también suma.'
              : `Te ${left === 1 ? 'falta 1 día' : `faltan ${left} días`} para tu meta. Los días de descanso no rompen la racha.`}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-7 gap-1.5">
        {DAYS_SHORT.map((l, i) => {
          const date = addDays(ws, i), on = daysSet.has(date), isToday = date === today
          return (
            <div key={l} className="flex flex-col items-center gap-1.5 text-[11px] font-semibold text-muted">
              <div className={`w-[30px] h-[30px] rounded-full grid place-items-center text-[13px] ${on ? 'bg-ok text-bg font-bold' : 'border-[1.5px] border-dashed border-line'} ${isToday ? 'outline outline-2 outline-accent outline-offset-1' : ''}`}>{on ? '✓' : ''}</div>
              {l}
            </div>
          )
        })}
      </div>

      {active ? (
        <div className="card bg-gradient-to-br from-surface2 to-surface border border-line">
          <span className="eyebrow">Tienes una sesión abierta</span>
          <button className="btn-primary w-full" onClick={() => nav('/entrenar/sesion')}>Continuar entrenamiento</button>
        </div>
      ) : d.routines.length === 0 ? (
        <div className="card bg-gradient-to-br from-surface2 to-surface border border-line">
          <span className="eyebrow">Empieza aquí</span>
          <h2 className="h2 text-2xl">Crea tu primera rutina</h2>
          <p className="text-sm text-muted m-0">Por ejemplo: Pierna los lunes, Empuje los miércoles. Luego registras cada serie aquí mismo.</p>
          <button className="btn-primary w-full" onClick={() => nav('/rutinas/nueva')}>Crear rutina</button>
        </div>
      ) : (
        <div className="card bg-gradient-to-br from-surface2 to-surface border border-line">
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow">{todayRoutine ? `Rutina de los ${DAYS_LONG[isoDay(today) - 1].toLowerCase()}` : 'Elige qué entrenar'}</span>
          </div>
          {todayRoutine && <h2 className="h2 text-[28px]">{todayRoutine.name}</h2>}
          {todayRoutine
            ? <button className="btn-primary w-full" onClick={() => start(todayRoutine.id)}>{trainedToday ? 'Entrenar otra vez' : 'Empezar entrenamiento'}</button>
            : null}
          <div className="flex flex-wrap gap-2">
            {d.routines.filter(r => r.id !== todayRoutine?.id).map(r => (
              <button key={r.id} className="chip" onClick={() => start(r.id)}>{r.name}</button>
            ))}
          </div>
        </div>
      )}

      {d.squad ? (
        <Link to={`/squad/${d.squad.id}`} className="card">
          <div className="flex justify-between items-center"><span className="eyebrow">{d.squad.name} · hoy</span><span className="chip">Ver squad</span></div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex">{d.attendance.map((m, i) => (
              <div key={m.id} className={i ? '-ml-2' : ''} style={{ borderRadius: 999, boxShadow: `0 0 0 2px ${cv('surface')}` }}>
                <Avatar profile={m} size={34} ring={m.trained} dim={!m.trained} /></div>))}
            </div>
            <span className="text-[13px] text-muted">{d.attendance.filter(a => a.trained).length} de {d.attendance.length} ya entrenaron</span>
          </div>
        </Link>
      ) : (
        <Link to="/squad" className="card">
          <span className="eyebrow">Entrena acompañado</span>
          <span className="text-sm">Crea un squad o únete con un código para ver quién ya entrenó hoy.</span>
        </Link>
      )}

      <div className="bg-surface rounded-2xl p-4 grid grid-cols-3 gap-2">
        <Stat v={daysDone} k="sesiones" />
        <Stat v={exCount} k="ejercicios" />
        <Stat v={`${tons(volume)} t`} k="volumen semanal" />
      </div>
    </>
  )
}

const Stat = ({ v, k }) => (
  <div className="flex flex-col gap-0.5"><span className="font-display font-bold text-[26px] leading-none num">{v}</span><span className="text-[11px] text-muted">{k}</span></div>
)
