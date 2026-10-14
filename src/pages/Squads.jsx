import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PageHeader, toast } from '../components/ui'
import { friendlyError } from '../lib/utils'

export default function Squads() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [squads, setSquads] = useState(null)
  const [invites, setInvites] = useState([])
  const [name, setName] = useState('')
  const [gym, setGym] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [s, i] = await Promise.all([
      supabase.from('squad_members').select('role, squad:squads(id, name, gym_name, squad_members(count))').eq('user_id', user.id),
      supabase.from('squad_invites').select('id, squad:squads(name, gym_name), inviter:profiles!squad_invites_invited_by_fkey(display_name)')
        .eq('invitee_id', user.id).eq('status', 'pending')
    ])
    setSquads(s.data || []); setInvites(i.data || [])
  }
  useEffect(() => { load() }, [user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e) {
    e.preventDefault()
    if (name.trim().length < 2) return toast('El nombre necesita al menos 2 letras', 'err')
    setBusy(true)
    const { data, error } = await supabase.from('squads').insert({ name: name.trim(), gym_name: gym.trim() || null, created_by: user.id }).select('id').single()
    setBusy(false)
    if (error) return toast(friendlyError(error), 'err')
    toast('Squad creado. Comparte el código para invitar.'); nav(`/squad/${data.id}`)
  }
  async function join(e) {
    e.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.rpc('join_squad_by_code', { p_code: code })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'err')
    toast('¡Ya eres parte del squad!'); nav(`/squad/${data}`)
  }
  async function respond(id, accept) {
    const { error } = await supabase.rpc(accept ? 'accept_squad_invite' : 'decline_squad_invite', { p_invite: id })
    if (error) return toast(friendlyError(error), 'err')
    toast(accept ? 'Invitación aceptada' : 'Invitación rechazada'); load()
  }

  return (
    <>
      <PageHeader eyebrow="Entrena acompañado" title="Tus squads" />

      {invites.map(i => (
        <div key={i.id} className="card border border-accent/40">
          <span className="eyebrow text-accent">Invitación pendiente</span>
          <span><b>{i.inviter?.display_name || 'Alguien'}</b> te invitó a <b>{i.squad?.name}</b>{i.squad?.gym_name ? ` · ${i.squad.gym_name}` : ''}</span>
          <div className="flex gap-2"><button className="btn-ghost flex-1" onClick={() => respond(i.id, false)}>Rechazar</button><button className="btn-primary flex-1" onClick={() => respond(i.id, true)}>Unirme</button></div>
        </div>
      ))}

      {squads === null ? <p className="text-muted">Cargando…</p> : squads.map(({ squad, role }) => (
        <Link key={squad.id} to={`/squad/${squad.id}`} className="card">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0"><h2 className="h2 text-2xl break-words">{squad.name}</h2>{squad.gym_name && <span className="text-sm text-muted">{squad.gym_name}</span>}</div>
            <span className="chip num">{squad.squad_members[0].count}/7</span>
          </div>
          {role === 'owner' && <span className="text-xs text-muted">Lo creaste tú</span>}
        </Link>
      ))}

      <form onSubmit={join} className="card">
        <span className="font-bold">Unirme con un código</span>
        <div className="flex gap-2">
          <input className="field num" placeholder="ej. 4f9a2c1b7e" value={code} onChange={e => setCode(e.target.value)} aria-label="Código del squad" autoCapitalize="none" />
          <button className="btn-primary shrink-0" disabled={busy || code.trim().length < 4}>Unirme</button>
        </div>
      </form>

      <form onSubmit={create} className="card">
        <span className="font-bold">Crear un squad nuevo</span>
        <p className="text-sm text-muted m-0">Hasta 7 personas en total. Tú más 6 amigos.</p>
        <input className="field" placeholder="Nombre del squad" value={name} onChange={e => setName(e.target.value)} maxLength={40} aria-label="Nombre del squad" />
        <input className="field" placeholder="Gimnasio (opcional)" value={gym} onChange={e => setGym(e.target.value)} maxLength={60} aria-label="Gimnasio" />
        <button className="btn-primary w-full" disabled={busy}>Crear squad</button>
      </form>
    </>
  )
}
