import { useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { load, save } from './lib/storage'
import TabBar from './components/TabBar'
import { Toaster } from './components/ui'
import Login from './pages/Login'
import Today from './pages/Today'
import Routines from './pages/Routines'
import RoutineEditor from './pages/RoutineEditor'
import Workout from './pages/Workout'
import Progress from './pages/Progress'
import Body from './pages/Body'
import SessionDetail from './pages/SessionDetail'
import Squads from './pages/Squads'
import SquadDetail from './pages/SquadDetail'
import Profile from './pages/Profile'
import Appearance from './pages/Appearance'

const LAST_ROUTE = 'sl:last-route'
const RESTORE_WINDOW_MS = 3 * 60 * 60 * 1000 // 3 horas

export default function App() {
  const { session, profile } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const restored = useRef(false)

  // Guarda la pantalla actual para volver a ella si el móvil recarga la app
  useEffect(() => {
    if (session && profile) save(LAST_ROUTE, { path: loc.pathname + loc.search, at: Date.now() })
  }, [loc.pathname, loc.search, session, profile])

  // Al tocar una notificación con la app abierta, ir a la pantalla indicada
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMsg = (e) => {
      if (e.data?.type !== 'navigate') return
      try { const u = new URL(e.data.url); nav(u.pathname + u.search) } catch { /* url inválida */ }
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [nav])

  // Al abrir la app en "/" (p. ej. el móvil la recargó), vuelve a la última pantalla reciente
  useEffect(() => {
    if (restored.current || !session || !profile) return
    restored.current = true
    const last = load(LAST_ROUTE)
    if (loc.pathname === '/' && !loc.search && last?.path && last.path !== '/' && Date.now() - last.at < RESTORE_WINDOW_MS) {
      nav(last.path, { replace: true })
    }
  }, [session, profile]) // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined || (session && !profile)) {
    return <div className="min-h-dvh grid place-items-center text-muted">Cargando…</div>
  }
  if (!session) return <Login />

  const hideTabs = loc.pathname.startsWith('/entrenar/sesion')
  return (
    <>
      <main className="max-w-[480px] mx-auto px-4 pt-4 pb-36 flex flex-col gap-5 safe-top">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/rutinas" element={<Routines />} />
          <Route path="/rutinas/:id" element={<RoutineEditor />} />
          <Route path="/entrenar/sesion" element={<Workout />} />
          <Route path="/progreso" element={<Progress />} />
          <Route path="/progreso/cuerpo" element={<Body />} />
          <Route path="/historial/:id" element={<SessionDetail />} />
          <Route path="/squad" element={<Squads />} />
          <Route path="/squad/:id" element={<SquadDetail />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="/perfil/apariencia" element={<Appearance />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!hideTabs && <TabBar />}
      <Toaster />
    </>
  )
}
