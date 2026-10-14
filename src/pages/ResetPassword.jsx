import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { toast } from '../components/ui'
import { friendlyError } from '../lib/utils'

const RULES = [
  { test: p => p.length >= 8, label: 'Al menos 8 caracteres' },
  { test: p => /[a-záéíóúñ]/i.test(p) && /\d/.test(p), label: 'Letras y números' }
]

export default function ResetPassword() {
  const { user, finishRecovery, signOut } = useAuth()
  const nav = useNavigate()
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const valid = RULES.every(r => r.test(pwd))
  const match = pwd.length > 0 && pwd === pwd2

  async function submit(e) {
    e.preventDefault()
    setErr(null)
    if (!valid) return setErr('La contraseña necesita al menos 8 caracteres, con letras y números.')
    if (!match) return setErr('Las dos contraseñas no coinciden.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pwd })
    setBusy(false)
    if (error) return setErr(friendlyError(error))
    finishRecovery()
    window.history.replaceState(null, '', '/')
    toast('Contraseña actualizada. Ya puedes entrar con ella.')
    nav('/', { replace: true })
  }

  async function cancel() {
    finishRecovery()
    await signOut()
    window.history.replaceState(null, '', '/')
  }

  return (
    <div className="min-h-dvh max-w-[420px] mx-auto px-4 py-10 flex flex-col justify-center gap-8 safe-top">
      <div className="flex flex-col gap-3">
        <div className="font-display font-bold uppercase text-[28px] tracking-wide">Squad<span className="text-accent">Lift</span></div>
        <h1 className="h1 text-[44px]">Crea tu nueva contraseña</h1>
        <p className="text-muted m-0">Para la cuenta <b className="text-fg break-all">{user?.email}</b>. Después entrarás con esta contraseña en todos tus dispositivos.</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div>
          <label className="label" htmlFor="np1">Contraseña nueva</label>
          <div className="relative">
            <input id="np1" type={show ? 'text' : 'password'} className="field pr-20" value={pwd} onChange={e => setPwd(e.target.value)} autoComplete="new-password" autoFocus />
            <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-accent px-2 py-1">{show ? 'Ocultar' : 'Mostrar'}</button>
          </div>
          <ul className="m-0 mt-2 p-0 list-none flex flex-col gap-1">
            {RULES.map(r => {
              const ok = r.test(pwd)
              return <li key={r.label} className={`text-xs flex items-center gap-1.5 ${ok ? 'text-ok' : 'text-muted'}`}><span aria-hidden="true">{ok ? '✓' : '○'}</span>{r.label}</li>
            })}
          </ul>
        </div>
        <div>
          <label className="label" htmlFor="np2">Repite la contraseña</label>
          <input id="np2" type={show ? 'text' : 'password'} className="field" value={pwd2} onChange={e => setPwd2(e.target.value)} autoComplete="new-password" />
          {pwd2.length > 0 && <p className={`text-xs m-0 mt-2 ${match ? 'text-ok' : 'text-danger'}`}>{match ? '✓ Coinciden' : 'Todavía no coinciden'}</p>}
        </div>
        {err && <p className="text-sm text-danger m-0" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy || !valid || !match}>{busy ? 'Guardando…' : 'Guardar contraseña nueva'}</button>
        <button type="button" className="text-sm text-muted py-1" onClick={cancel}>Cancelar</button>
      </form>
    </div>
  )
}
