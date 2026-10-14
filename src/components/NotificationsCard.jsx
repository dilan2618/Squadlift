import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { toast } from './ui'
import { pushSupported, isIOS, isStandalone, currentSubscription, enablePush, disablePush } from '../lib/push'
import { friendlyError } from '../lib/utils'

export default function NotificationsCard() {
  const { user, profile, refreshProfile } = useAuth()
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [prefs, setPrefs] = useState({
    notify_squad: profile.notify_squad, notify_reactions: profile.notify_reactions,
    notify_reminder: profile.notify_reminder, reminder_hour: profile.reminder_hour
  })
  const needsInstall = isIOS() && !isStandalone()
  const supported = pushSupported()

  useEffect(() => { currentSubscription().then(s => setOn(!!s && Notification.permission === 'granted')).catch(() => {}) }, [])

  async function activate() {
    setBusy(true)
    try {
      await enablePush(user.id); setOn(true)
      await supabase.rpc('send_test_push')
      toast('Notificaciones activadas. Te enviamos una de prueba.')
    } catch (e) { toast(e.message?.startsWith('En iPhone') || e.message?.startsWith('No diste') || e.message?.startsWith('Este navegador') ? e.message : friendlyError(e), 'err') }
    finally { setBusy(false) }
  }
  async function deactivate() {
    setBusy(true); await disablePush().catch(() => {}); setOn(false); setBusy(false); toast('Notificaciones desactivadas en este dispositivo')
  }
  async function test() {
    const { error } = await supabase.rpc('send_test_push')
    toast(error ? friendlyError(error) : 'Enviada. Debería llegarte en unos segundos.', error ? 'err' : 'ok')
  }
  async function setPref(k, v) {
    const next = { ...prefs, [k]: v }; setPrefs(next)
    const { error } = await supabase.from('profiles').update({ [k]: v }).eq('id', user.id)
    if (error) { toast(friendlyError(error), 'err'); setPrefs(prefs) } else refreshProfile()
  }

  return (
    <div className="card">
      <div className="flex justify-between items-center gap-3">
        <span className="font-bold">Notificaciones</span>
        <span className={`text-[11px] font-bold uppercase tracking-wider ${on ? 'text-ok' : 'text-muted'}`}>{on ? 'Activadas' : 'Apagadas'}</span>
      </div>

      {needsInstall ? (
        <div className="bg-surface2 rounded-xl p-3 text-sm flex flex-col gap-1.5">
          <b>En iPhone, primero instala la app</b>
          <span className="text-muted">Abre esta página en Safari, toca <b className="text-fg">Compartir</b> (cuadrado con flecha) → <b className="text-fg">Agregar a pantalla de inicio</b>. Luego abre SquadLift desde su ícono y vuelve aquí.</span>
        </div>
      ) : !supported ? (
        <p className="text-sm text-muted m-0">Este navegador no permite notificaciones. Prueba con Chrome o con la app instalada en la pantalla de inicio.</p>
      ) : on ? (
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={test}>Enviar prueba</button>
          <button className="btn-ghost flex-1 text-muted" disabled={busy} onClick={deactivate}>Desactivar</button>
        </div>
      ) : (
        <button className="btn-primary w-full" disabled={busy} onClick={activate}>{busy ? 'Activando…' : 'Activar notificaciones'}</button>
      )}

      <div className="flex flex-col divide-y divide-line">
        <Toggle label="Mi squad entrena o comparte rutina" checked={prefs.notify_squad} onChange={v => setPref('notify_squad', v)} />
        <Toggle label="Reacciones a mis publicaciones" checked={prefs.notify_reactions} onChange={v => setPref('notify_reactions', v)} />
        <Toggle label="Recordatorio si hoy toca rutina y no he entrenado" checked={prefs.notify_reminder} onChange={v => setPref('notify_reminder', v)} />
      </div>
      {prefs.notify_reminder && (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Hora del recordatorio</span>
          <select className="h-10 rounded-lg bg-surface2 px-3 num" value={prefs.reminder_hour} onChange={e => setPref('reminder_hour', Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </label>
      )}
    </div>
  )
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2.5 cursor-pointer">
      <span className="text-sm">{label}</span>
      <span className="relative shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="block w-11 h-6 rounded-full bg-surface2 peer-checked:bg-accent transition" />
        <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-fg peer-checked:translate-x-5 transition" />
      </span>
    </label>
  )
}
