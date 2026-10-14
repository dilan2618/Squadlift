import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Avatar, PageHeader, toast } from '../components/ui'
import { friendlyError } from '../lib/utils'
import NotificationsCard from '../components/NotificationsCard'

export default function Profile() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const [f, setF] = useState({
    display_name: profile.display_name, username: profile.username, bio: profile.bio || '', goals: profile.goals || '',
    weekly_goal_days: profile.weekly_goal_days, unit: profile.unit, visibility: profile.visibility
  })
  const [busy, setBusy] = useState(false)
  const [pwd, setPwd] = useState('')
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('profiles').update({
      ...f, username: f.username.trim().toLowerCase(), display_name: f.display_name.trim(),
      bio: f.bio.trim() || null, goals: f.goals.trim() || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || profile.timezone
    }).eq('id', user.id)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'err')
    await refreshProfile(); toast('Perfil guardado')
  }

  async function upload(e) {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 3 * 1024 * 1024) return toast('La foto debe pesar menos de 3 MB', 'err')
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${user.id}/avatar-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
    if (error) return toast(friendlyError(error), 'err')
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', user.id)
    await refreshProfile(); toast('Foto actualizada')
  }

  async function changePassword() {
    if (pwd.length < 8) return toast('La contraseña necesita al menos 8 caracteres', 'err')
    const { error } = await supabase.auth.updateUser({ password: pwd })
    if (error) return toast(friendlyError(error), 'err')
    setPwd(''); toast('Contraseña actualizada')
  }

  return (
    <>
      <PageHeader eyebrow={`@${profile.username}`} title="Tu perfil" />

      <div className="flex items-center gap-4">
        <Avatar profile={profile} size={72} />
        <label className="btn-ghost cursor-pointer text-sm">
          Cambiar foto
          <input type="file" accept="image/*" className="sr-only" onChange={upload} />
        </label>
      </div>

      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="card">
          <div><label className="label" htmlFor="dn">Nombre</label><input id="dn" className="field" value={f.display_name} onChange={e => set('display_name', e.target.value)} maxLength={40} /></div>
          <div><label className="label" htmlFor="un">Usuario (para que te inviten)</label>
            <input id="un" className="field" value={f.username} onChange={e => set('username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} maxLength={24} autoCapitalize="none" /></div>
          <div><label className="label" htmlFor="bio">Sobre ti</label><textarea id="bio" className="field h-20 py-2.5" value={f.bio} onChange={e => set('bio', e.target.value)} maxLength={280} /></div>
          <div><label className="label" htmlFor="goals">Metas personales</label><textarea id="goals" className="field h-20 py-2.5" placeholder="Ej.: entrenar 4 días por semana durante 3 meses" value={f.goals} onChange={e => set('goals', e.target.value)} maxLength={280} /></div>
        </div>

        <div className="card">
          <span className="label m-0">Meta semanal: <b className="text-fg">{f.weekly_goal_days} {f.weekly_goal_days === 1 ? 'día' : 'días'}</b></span>
          <div className="grid grid-cols-7 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map(n => (
              <button type="button" key={n} onClick={() => set('weekly_goal_days', n)} aria-pressed={f.weekly_goal_days === n}
                className={`h-10 rounded-lg num font-semibold ${f.weekly_goal_days === n ? 'bg-accent text-ink' : 'bg-surface2 text-muted'}`}>{n}</button>
            ))}
          </div>
          <p className="text-xs text-muted m-0">Tu racha cuenta semanas que cumplen esta meta. Descansar el resto de días no la rompe.</p>
          <span className="label m-0 mt-1">Unidad de peso</span>
          <div className="grid grid-cols-2 gap-2">
            {['kg', 'lb'].map(u => <button type="button" key={u} onClick={() => set('unit', u)} className={`h-10 rounded-lg font-semibold ${f.unit === u ? 'bg-accent text-ink' : 'bg-surface2 text-muted'}`}>{u}</button>)}
          </div>
          <span className="label m-0 mt-1">¿Quién puede ver tu progreso?</span>
          <div className="grid grid-cols-3 gap-2">
            {[['public', 'Todos'], ['friends', 'Amigos'], ['private', 'Solo squad']].map(([v, l]) => (
              <button type="button" key={v} onClick={() => set('visibility', v)} className={`h-10 rounded-lg text-sm font-semibold ${f.visibility === v ? 'bg-accent text-ink' : 'bg-surface2 text-muted'}`}>{l}</button>
            ))}
          </div>
        </div>

        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Guardando…' : 'Guardar perfil'}</button>
      </form>

      <Link to="/perfil/apariencia" className="card flex-row items-center justify-between">
        <span className="flex items-center gap-3">
          <span className="flex -space-x-1.5" aria-hidden="true">
            <span className="w-6 h-6 rounded-full bg-accent ring-2 ring-surface" />
            <span className="w-6 h-6 rounded-full bg-ok ring-2 ring-surface" />
            <span className="w-6 h-6 rounded-full bg-surface3 ring-2 ring-surface" />
          </span>
          <span><b className="block">Apariencia y colores</b><span className="text-xs text-muted">Temas, modo claro, colores a tu gusto</span></span>
        </span>
        <span className="text-muted">›</span>
      </Link>

      <NotificationsCard />

      <div className="card">
        <span className="font-bold">Contraseña</span>
        <div className="flex gap-2">
          <input type="password" className="field" placeholder="Nueva contraseña" value={pwd} onChange={e => setPwd(e.target.value)} autoComplete="new-password" aria-label="Nueva contraseña" />
          <button className="btn-ghost shrink-0" onClick={changePassword}>Cambiar</button>
        </div>
      </div>

      <p className="text-xs text-muted text-center m-0">{user.email}</p>
      <button className="btn-ghost w-full" onClick={signOut}>Cerrar sesión</button>
    </>
  )
}
