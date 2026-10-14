import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import { applyTheme, saveLocalTheme } from './theme'
import { clearAll } from './offline'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = cargando
  const [profile, setProfile] = useState(null)
  // true cuando el usuario llega desde el enlace "recuperar contraseña" del correo
  const [recovery, setRecovery] = useState(() =>
    window.location.pathname === '/nueva-contrasena' || /type=recovery/.test(window.location.hash))
  const uidRef = useRef(null)

  const loadProfile = useCallback(async (uid) => {
    if (!uid) { setProfile(null); return }
    // Reintenta: en el móvil, al volver de segundo plano la red tarda un instante
    for (let i = 0; i < 3; i++) {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
      if (!error && data) {
        // El tema guardado en tu perfil manda: así se ve igual en todos tus dispositivos
        if (data.theme) { const t = applyTheme(data.theme); saveLocalTheme(t) }
        setProfile(data); return
      }
      await new Promise(r => setTimeout(r, 800 * (i + 1)))
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      uidRef.current = data.session?.user.id ?? null
      loadProfile(uidRef.current)
    })
    // Importante: no llamar a Supabase dentro del callback (puede bloquearse);
    // se difiere con setTimeout y solo se recarga el perfil si cambió el usuario.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setTimeout(() => {
        if (event === 'SIGNED_OUT') { uidRef.current = null; setSession(null); setProfile(null); setRecovery(false); return }
        if (event === 'PASSWORD_RECOVERY') setRecovery(true)
        if (!s) return
        setSession(s)
        const uid = s.user.id
        if (uid !== uidRef.current || event === 'USER_UPDATED') { uidRef.current = uid; loadProfile(uid) }
      }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const value = {
    session, user: session?.user, profile, recovery,
    finishRecovery: () => setRecovery(false),
    refreshProfile: () => loadProfile(session?.user.id),
    signOut: async () => {
      // Sin conexión, Supabase no puede avisar al servidor: cerramos la sesión en el teléfono igualmente
      const { error } = await supabase.auth.signOut().catch(e => ({ error: e }))
      if (error) {
        try { Object.keys(localStorage).filter(k => /^sb-.*-auth-token$/.test(k)).forEach(k => localStorage.removeItem(k)) } catch { /* nada */ }
        uidRef.current = null; setSession(null); setProfile(null); setRecovery(false)
      }
      await clearAll()
    }
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
