import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/utils'
import { Toaster } from '../components/ui'
import { useAuth } from '../lib/auth'
import { load, save } from '../lib/storage'
import Welcome from './Welcome'

const WELCOME_KEY = 'sl:welcome-seen'

export default function Login() {
  const { finishRecovery } = useAuth()
  // La primera vez se ve la bienvenida; después, directo a entrar
  const [mode, setMode] = useState(() => load(WELCOME_KEY) ? 'login' : 'welcome') // welcome | login | signup | reset
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [googleOn, setGoogleOn] = useState(false)

  useEffect(() => {
    // ¿Está activado Google en Supabase? Si no, el botón no se muestra.
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } })
      .then(r => r.json()).then(j => setGoogleOn(!!j?.external?.google)).catch(() => setGoogleOn(false))
    // Si volvemos de Google o de un enlace del correo con error en la URL, lo explicamos y limpiamos la URL
    const p = new URLSearchParams(window.location.search + '&' + window.location.hash.slice(1))
    const err = p.get('error_description') || p.get('error')
    const code = p.get('error_code') || ''
    if (err) {
      const fromEmail = code === 'otp_expired' || /email link|expired/i.test(err) || window.location.pathname === '/nueva-contrasena'
      if (fromEmail) {
        setMode('reset')
        setMsg({ ok: false, text: 'Ese enlace caducó o ya se usó. Escribe tu correo y te enviamos uno nuevo.' })
      } else {
        setMsg({ ok: false, text: 'No se pudo entrar con Google: ' + decodeURIComponent(err.replace(/\+/g, ' ')) })
      }
      finishRecovery()
      window.history.replaceState(null, '', '/')
    }
  }, [])

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const redirect = window.location.origin
    try {
      if (mode === 'signup') {
        if (password.length < 8) throw new Error('La contraseña necesita al menos 8 caracteres.')
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { data: { full_name: name.trim() }, emailRedirectTo: redirect }
        })
        if (error) throw error
        if (!data.session) setMsg({ ok: true, text: `Te enviamos un correo a ${email}. Ábrelo para confirmar tu cuenta y vuelve aquí.` })
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect + '/nueva-contrasena' })
        if (error) throw error
        setMsg({ ok: true, text: `Listo. Si ${email.trim()} tiene cuenta, te llegará un correo con un enlace para crear tu contraseña nueva. Ábrelo en este mismo teléfono. Si no lo ves en unos minutos, revisa la carpeta de spam.` })
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message?.startsWith('La contraseña') ? err.message : friendlyError(err) })
    } finally { setBusy(false) }
  }

  async function google() {
    setMsg(null); setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } }
    })
    if (error) { setBusy(false); setMsg({ ok: false, text: friendlyError(error) }) }
  }

  const go = (m) => { save(WELCOME_KEY, true); setMode(m); setMsg(null) }
  if (mode === 'welcome') return <><Welcome onStart={() => go('signup')} onLogin={() => go('login')} /><Toaster /></>

  const titles = { login: 'Entra a entrenar', signup: 'Crea tu cuenta', reset: 'Recupera tu acceso' }
  return (
    <div className="min-h-dvh max-w-[420px] mx-auto px-4 py-10 flex flex-col justify-center gap-8 safe-top">
      <Toaster />
      <div key={mode} className="flex flex-col gap-3 page-enter">
        <div className="font-display font-bold uppercase text-[28px] tracking-wide">Squad<span className="text-accent">Lift</span></div>
        <h1 className="h1 text-[44px]">{titles[mode]}</h1>
        <p className="text-muted m-0">{mode === 'reset'
          ? 'Escribe el correo con el que te registraste. Te enviaremos un enlace para crear una contraseña nueva.'
          : 'Registra tus entrenamientos, cumple tu meta semanal y motívate con tu squad de hasta 7 personas.'}</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {mode === 'signup' && (
          <div><label className="label" htmlFor="name">Tu nombre</label>
            <input id="name" className="field" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" /></div>
        )}
        <div><label className="label" htmlFor="email">Correo</label>
          <input id="email" type="email" className="field" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" inputMode="email" /></div>
        {mode !== 'reset' && (
          <div><label className="label" htmlFor="password">Contraseña</label>
            <input id="password" type="password" className="field" value={password} onChange={e => setPassword(e.target.value)} required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            {mode === 'login' && <button type="button" className="text-xs text-accent font-semibold mt-2" onClick={() => { setMode('reset'); setMsg(null) }}>¿Olvidaste tu contraseña?</button>}
          </div>
        )}
        {msg && <p className={`text-sm m-0 ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.text}</p>}
        <button className="btn-primary w-full" disabled={busy || !email || (mode !== 'reset' && !password)}>
          {busy ? 'Un momento…' : mode === 'signup' ? 'Crear cuenta' : mode === 'login' ? 'Entrar' : 'Enviar enlace'}
        </button>
        {mode !== 'reset' && googleOn && (
          <button type="button" onClick={google} className="btn-ghost w-full">
            <svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3zM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22zm-5.6-8a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9zM12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z" /></svg>
            Continuar con Google
          </button>
        )}
      </form>

      <div className="flex flex-col gap-2 text-sm text-center">
        {mode === 'login' && <>
          <button className="text-accent font-semibold" onClick={() => { setMode('signup'); setMsg(null) }}>¿No tienes cuenta? Regístrate</button>
        </>}
        {mode !== 'login' && <button className="text-accent font-semibold" onClick={() => { setMode('login'); setMsg(null) }}>Ya tengo cuenta</button>}
        <button className="text-muted text-xs mt-2" onClick={() => { setMode('welcome'); setMsg(null) }}>← Volver al inicio</button>
      </div>
    </div>
  )
}
