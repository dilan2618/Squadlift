import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { load, save } from './lib/storage'
import TabBar from './components/TabBar'
import { Toaster, toast } from './components/ui'
import OfflineBar from './components/OfflineBar'
import { warmOfflineCache } from './lib/queries'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
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
  const { session, profile, recovery } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const restored = useRef(false)
  const [syncKey, setSyncKey] = useState(0)

  // Al terminar de sincronizar, recarga la pantalla con los datos del servidor
  useEffect(() => {
    const onSynced = (e) => {
      setSyncKey(k => k + 1)
      toast(`✓ ${e.detail.sent === 1 ? 'Cambio sincronizado' : 'Cambios sincronizados'} con el servidor`)
    }
    window.addEventListener('sl:synced', onSynced)
    return () => window.removeEventListener('sl:synced', onSynced)
  }, [])

  // Con conexión, deja listo en el teléfono lo necesario para entrenar sin internet
  useEffect(() => {
    if (!session || !profile) return
    const t = setTimeout(() => warmOfflineCache(session.user.id), 2500)
    return () => clearTimeout(t)
  }, [session, profile])

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
  if (recovery) return <><ResetPassword /><Toaster /></>

  const hideTabs = loc.pathname.startsWith('/entrenar/sesion')
  // Tras sincronizar solo se recargan pantallas de consulta (no editores ni el entrenamiento en curso)
  const refreshable = ['/', '/rutinas', '/progreso', '/progreso/cuerpo', '/squad'].includes(loc.pathname) || /^\/squad\/[^/]+$/.test(loc.pathname)
  const viewKey = loc.pathname + (refreshable ? ':' + syncKey : '')
  return (
    <>
      <main className="max-w-[480px] mx-auto px-4 pt-4 pb-36 flex flex-col gap-5 safe-top">
        <OfflineBar />
        <div key={viewKey} className="page-enter flex flex-col gap-5">
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
        </div>
      </main>
      {!hideTabs && <TabBar />}
      <Toaster />
    </>
  )
}
