import { Ring } from '../components/ui'
import { cv } from '../lib/theme'
import { DAYS_SHORT } from '../lib/utils'

const POINTS = [
  { title: 'Registra en segundos', text: 'Series, peso y descanso, con un toque por serie.', icon: <path d="M4 12.5l5 5L20 6.5" /> },
  { title: 'Constancia sin obsesión', text: 'Tu racha cuenta semanas cumplidas. Descansar no la rompe.', icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></> },
  { title: 'Con tu squad', text: 'Hasta 7 amigos: quién ya entrenó, récords y reacciones.', icon: <><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2.4" /><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M15 15.2c2.6-.4 4.6.9 5.3 3.8" /></> }
]

// Días de ejemplo que se van marcando en la animación (L, M, J, S)
const DEMO_WEEK = [true, true, false, true, false, true, false]

export default function Welcome({ onStart, onLogin }) {
  return (
    <div className="min-h-dvh max-w-[420px] mx-auto px-5 flex flex-col safe-top" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}>
      <div className="font-display font-bold uppercase text-[24px] tracking-wide anim-in">Squad<span className="text-accent">Lift</span></div>

      <div className="flex-1 flex flex-col justify-center gap-8 py-8">
        <div className="flex items-center gap-5 anim-in" style={{ animationDelay: '80ms' }}>
          <div className="ring-fill">
            <Ring value={4} max={4} size={104} color={cv('ok')}>
              <span className="font-display font-bold text-3xl leading-none">4/4</span>
              <small className="text-[10px] text-muted">esta semana</small>
            </Ring>
          </div>
          <div className="grid grid-cols-7 gap-1.5 flex-1" aria-hidden="true">
            {DAYS_SHORT.map((d, i) => (
              <div key={d} className="flex flex-col items-center gap-1.5 text-[10px] font-semibold text-muted">
                <span className={`w-6 h-6 rounded-full ${DEMO_WEEK[i] ? 'day-pop bg-ok' : 'border-[1.5px] border-dashed border-line'}`}
                  style={DEMO_WEEK[i] ? { animationDelay: `${450 + i * 140}ms` } : undefined} />
                {d}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 anim-in" style={{ animationDelay: '160ms' }}>
          <h1 className="h1 text-[46px]">Entrena constante. Juntos.</h1>
          <p className="text-muted m-0 text-[15px] leading-relaxed">Lleva tus entrenamientos, mira tu progreso y apóyate en tu grupo del gym.</p>
        </div>

        <ul className="m-0 p-0 list-none flex flex-col gap-4">
          {POINTS.map((p, i) => (
            <li key={p.title} className="flex gap-3.5 items-start anim-in" style={{ animationDelay: `${260 + i * 90}ms` }}>
              <span className="w-9 h-9 rounded-xl bg-surface grid place-items-center shrink-0 text-accent">
                <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{p.icon}</svg>
              </span>
              <span className="min-w-0"><b className="block text-[15px]">{p.title}</b><span className="text-sm text-muted">{p.text}</span></span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2.5 anim-in" style={{ animationDelay: '560ms' }}>
        <button className="btn-primary w-full text-[16px]" onClick={onStart}>Empezar gratis</button>
        <button className="btn-ghost w-full" onClick={onLogin}>Ya tengo cuenta</button>
      </div>
    </div>
  )
}
