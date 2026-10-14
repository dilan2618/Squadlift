import { supabase } from './supabase'

export const VAPID_PUBLIC = 'BHxQe_6T0FUazUv0vhoZUqtGxPA1jh5Mx50uXZwn_x_VAN1gcY80-8Vs7mrAR2bm1QB_1v2bBAm1kSmQqTCE_6k'

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null
  try { return await navigator.serviceWorker.register('/sw.js') } catch { return null }
}

/** ¿Este dispositivo ya tiene notificaciones activas? */
export async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

/** Pide permiso, suscribe este dispositivo y lo guarda en la base de datos */
export async function enablePush(userId) {
  if (!pushSupported()) throw new Error(isIOS() && !isStandalone()
    ? 'En iPhone primero instala la app: Compartir → Agregar a pantalla de inicio, y ábrela desde su ícono.'
    : 'Este navegador no permite notificaciones.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('No diste permiso. Puedes activarlo en los ajustes del teléfono para esta app.')
  const reg = (await navigator.serviceWorker.getRegistration()) || (await registerSW())
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(VAPID_PUBLIC) })
  const j = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200)
  }, { onConflict: 'endpoint' })
  if (error) throw error
  return sub
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe().catch(() => {})
}
