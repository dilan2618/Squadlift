import { useEffect, useState } from 'react'
import { subscribe, flush, dismissFailed } from '../lib/offline'

/** Aviso discreto arriba: sin conexión, cambios pendientes o sincronizando */
export default function OfflineBar() {
  const [s, setS] = useState({ online: true, pending: 0, syncing: false, failed: 0 })
  useEffect(() => subscribe(setS), [])

  let text = null, tone = 'muted', action = null
  if (!s.online) {
    text = s.pending
      ? `Sin conexión · ${s.pending} ${s.pending === 1 ? 'cambio guardado' : 'cambios guardados'} en el teléfono`
      : 'Sin conexión · Lo que hagas se guarda en el teléfono'
  } else if (s.syncing || s.pending) {
    text = s.syncing ? `Sincronizando ${s.pending} ${s.pending === 1 ? 'cambio' : 'cambios'}…` : `${s.pending} ${s.pending === 1 ? 'cambio pendiente' : 'cambios pendientes'}`
    tone = 'accent'
    if (!s.syncing) action = <button className="font-bold underline underline-offset-2" onClick={() => flush()}>Enviar ahora</button>
  } else if (s.failed) {
    text = `${s.failed} ${s.failed === 1 ? 'cambio no se pudo guardar' : 'cambios no se pudieron guardar'} en el servidor`
    tone = 'danger'
    action = <button className="font-bold underline underline-offset-2" onClick={dismissFailed}>Entendido</button>
  }
  if (!text) return null

  const colors = { muted: 'bg-surface2 text-fg', accent: 'bg-accent/15 text-accent', danger: 'bg-danger/15 text-danger' }
  return (
    <div className="sticky z-30 -mx-1 page-enter" style={{ top: 'calc(8px + env(safe-area-inset-top, 0px))' }} role="status" aria-live="polite">
      <div className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold backdrop-blur ${colors[tone]}`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${!s.online ? 'bg-muted' : tone === 'danger' ? 'bg-danger' : 'bg-accent animate-pulse'}`} />
        <span className="flex-1 min-w-0">{text}</span>
        {action}
      </div>
    </div>
  )
}
