import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', label: 'Hoy', icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></> },
  { to: '/rutinas', label: 'Rutinas', icon: <path d="M3 9v6M6 6.5v11M18 6.5v11M21 9v6M6 12h12" /> },
  { to: '/progreso', label: 'Progreso', icon: <path d="M4 19h16M6 15l4-4 3 3 5-6" /> },
  { to: '/squad', label: 'Squad', icon: <><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2.4" /><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M15 15.2c2.6-.4 4.6.9 5.3 3.8" /></> },
  { to: '/perfil', label: 'Perfil', icon: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></> }
]

export default function TabBar() {
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 bg-bg/90 backdrop-blur border-t border-line safe-bottom" aria-label="Secciones">
        <div className="max-w-[480px] mx-auto grid grid-cols-5">
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'}
              className={({ isActive }) => `h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${isActive ? 'text-accent' : 'text-muted'}`}>
              <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}
