import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PageHeader, Empty } from '../components/ui'
import { DAYS_LONG } from '../lib/utils'

export default function Routines() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [list, setList] = useState(null)

  useEffect(() => {
    supabase.from('routines')
      .select('id, name, day_of_week, routine_exercises(position, target_sets, exercise:exercises(name, muscle_group))')
      .eq('owner_id', user.id).eq('archived', false).order('day_of_week', { nullsFirst: false })
      .then(({ data }) => setList(data || []))
  }, [user.id])

  return (
    <>
      <PageHeader eyebrow="Tu semana" title="Rutinas" right={<Link to="/rutinas/nueva" className="btn-primary min-h-[40px] px-4 text-sm">+ Nueva</Link>} />
      {!list ? <p className="text-muted">Cargando…</p> : list.length === 0 ? (
        <Empty title="Aún no tienes rutinas" text="Crea una por cada día que entrenas: Pecho / Tríceps, Pierna, Espalda / Bíceps…"
          action={<Link to="/rutinas/nueva" className="btn-primary w-full">Crear mi primera rutina</Link>} />
      ) : list.map(r => {
        const exs = [...r.routine_exercises].sort((a, b) => a.position - b.position)
        const muscles = [...new Set(exs.map(e => e.exercise.muscle_group))]
        return (
          <article key={r.id} className="card">
            <div className="flex justify-between items-start gap-3">
              <div className="flex flex-col gap-1 min-w-0">
                <span className="eyebrow">{r.day_of_week ? DAYS_LONG[r.day_of_week - 1] : 'Día libre'}</span>
                <h2 className="h2 text-2xl break-words">{r.name}</h2>
              </div>
              <Link to={`/rutinas/${r.id}`} className="chip">Editar</Link>
            </div>
            <div className="flex flex-wrap gap-1.5">{muscles.map(m => <span key={m} className="chip">{m}</span>)}</div>
            <p className="text-sm text-muted m-0">{exs.length} ejercicios · {exs.reduce((a, e) => a + e.target_sets, 0)} series</p>
            <button className="btn-ghost w-full" onClick={() => nav(`/entrenar/sesion?rutina=${r.id}`)} disabled={!exs.length}>Entrenar esta rutina</button>
          </article>
        )
      })}
    </>
  )
}
