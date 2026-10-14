import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Avatar, PageHeader, toast } from '../components/ui'
import { friendlyError, localDate, weekStart, timeAgo, tons, toUnit } from '../lib/utils'

const EMOJIS = ['💪', '🔥', '👏', '🙌']

export default function SquadDetail() {
  const { id } = useParams()
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const today = localDate(profile.timezone)
  const [squad, setSquad] = useState(null)
  const [members, setMembers] = useState([])
  const [pending, setPending] = useState([])
  const [att, setAtt] = useState({})
  const [week, setWeek] = useState({})
  const [shared, setShared] = useState([])
  const [feed, setFeed] = useState([])
  const [myRoutines, setMyRoutines] = useState([])
  const [invite, setInvite] = useState('')
  const [shareForm, setShareForm] = useState({ open: false, routine: '', time: '18:30' })
  const [confirmLeave, setConfirmLeave] = useState(false)

  const loadFeed = useCallback(async () => {
    const { data } = await supabase.from('feed_posts').select('id, kind, body, created_at, author_id, reactions(emoji, user_id)')
      .eq('squad_id', id).order('created_at', { ascending: false }).limit(30)
    setFeed(data || [])
  }, [id])

  const loadActivity = useCallback(async (memberIds) => {
    const [a, w] = await Promise.all([
      supabase.from('squad_attendance_today').select('user_id, trained_today').eq('squad_id', id),
      supabase.from('weekly_training_days').select('user_id, days_trained').in('user_id', memberIds).eq('week_start', weekStart(today))
    ])
    setAtt(Object.fromEntries((a.data || []).map(x => [x.user_id, x.trained_today])))
    setWeek(Object.fromEntries((w.data || []).map(x => [x.user_id, x.days_trained])))
  }, [id, today])

  const loadAll = useCallback(async () => {
    const { data: s, error } = await supabase.from('squads').select('*').eq('id', id).maybeSingle()
    if (error || !s) { toast('No tienes acceso a este squad', 'err'); return nav('/squad') }
    const [m, p, sh, r] = await Promise.all([
      supabase.from('squad_members').select('role, profile:profiles(id, display_name, username, avatar_url)').eq('squad_id', id).order('joined_at'),
      supabase.from('squad_invites').select('id, invitee:profiles!squad_invites_invitee_id_fkey(username)').eq('squad_id', id).eq('status', 'pending').gt('expires_at', new Date().toISOString()),
      supabase.from('squad_shared_routines').select('id, meet_time, routine_id, routine:routines(name), sharer:profiles!squad_shared_routines_shared_by_fkey(id, display_name)')
        .eq('squad_id', id).eq('for_date', today),
      supabase.from('routines').select('id, name').eq('owner_id', user.id).eq('archived', false)
    ])
    const mem = (m.data || []).filter(x => x.profile)
    setSquad(s); setMembers(mem); setPending(p.data || []); setShared(sh.data || []); setMyRoutines(r.data || [])
    await Promise.all([loadActivity(mem.map(x => x.profile.id)), loadFeed()])
  }, [id, today, user.id, nav, loadActivity, loadFeed])

  useEffect(() => { loadAll() }, [loadAll])

  // Tiempo real: muro, reacciones y asistencia
  useEffect(() => {
    const ch = supabase.channel(`squad-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_posts', filter: `squad_id=eq.${id}` }, () => { loadFeed(); loadActivity(members.map(m => m.profile.id)) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => loadFeed())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id, loadFeed, loadActivity, members])

  const byId = Object.fromEntries(members.map(m => [m.profile.id, m.profile]))
  const used = members.length + pending.length
  const free = 7 - used

  async function sendInvite(e) {
    e.preventDefault()
    const { error } = await supabase.rpc('invite_to_squad', { p_squad: id, p_username: invite })
    if (error) return toast(friendlyError(error), 'err')
    toast(`Invitación enviada a @${invite.replace('@', '')}`); setInvite(''); loadAll()
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(squad.invite_code); toast('Código copiado') }
    catch { toast(`Código: ${squad.invite_code}`) }
  }
  async function react(post, emoji) {
    const mine = post.reactions.some(r => r.user_id === user.id && r.emoji === emoji)
    setFeed(f => f.map(p => p.id !== post.id ? p : { ...p, reactions: mine ? p.reactions.filter(r => !(r.user_id === user.id && r.emoji === emoji)) : [...p.reactions, { emoji, user_id: user.id }] }))
    const q = mine
      ? supabase.from('reactions').delete().match({ post_id: post.id, user_id: user.id, emoji })
      : supabase.from('reactions').insert({ post_id: post.id, user_id: user.id, emoji })
    const { error } = await q
    if (error) { toast(friendlyError(error), 'err'); loadFeed() }
  }
  async function shareRoutine(e) {
    e.preventDefault()
    const r = myRoutines.find(x => x.id === shareForm.routine)
    if (!r) return toast('Elige una rutina', 'err')
    const { error } = await supabase.from('squad_shared_routines').insert({ squad_id: id, routine_id: r.id, shared_by: user.id, for_date: today, meet_time: shareForm.time || null })
    if (error) return toast(friendlyError(error), 'err')
    await supabase.from('feed_posts').insert({ squad_id: id, author_id: user.id, kind: 'routine_shared', body: JSON.stringify({ routine: r.name, time: shareForm.time }) })
    setShareForm({ open: false, routine: '', time: '18:30' }); toast('Rutina compartida con el squad'); loadAll()
  }
  async function leave() {
    const { error } = await supabase.from('squad_members').delete().match({ squad_id: id, user_id: user.id })
    if (error) return toast(friendlyError(error), 'err')
    toast('Saliste del squad'); nav('/squad')
  }

  if (!squad) return <p className="text-muted">Cargando squad…</p>
  const ranked = [...members].sort((a, b) => (week[b.profile.id] || 0) - (week[a.profile.id] || 0))
  const trainedCount = members.filter(m => att[m.profile.id]).length

  return (
    <>
      <PageHeader eyebrow={squad.gym_name || 'Squad'} title={squad.name} right={<button className="chip" onClick={() => nav('/squad')}>Volver</button>} />

      <section className="card">
        <div className="flex justify-between items-center"><span className="eyebrow">Integrantes</span><span className="num text-[13px]">{used}/7</span></div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className={`h-2 rounded-full ${i < members.length ? 'bg-accent' : i < used ? 'bg-accent/40' : 'bg-surface2'}`} />
          ))}
        </div>
        {pending.length > 0 && <p className="text-xs text-muted m-0">Pendientes: {pending.map(p => p.invitee?.username ? '@' + p.invitee.username : 'invitado').join(', ')}</p>}
        <div className="flex items-center justify-between gap-2 bg-surface2 rounded-xl px-3.5 py-2.5">
          <div className="min-w-0"><span className="text-xs text-muted block">Código para unirse</span><span className="num text-lg select-all">{squad.invite_code}</span></div>
          <button className="chip chip-on shrink-0" onClick={copyCode}>Copiar</button>
        </div>
        <form className="flex gap-2" onSubmit={sendInvite}>
          <input className="field" placeholder={free > 0 ? '@usuario' : 'Squad completo'} value={invite} onChange={e => setInvite(e.target.value)} disabled={free <= 0} aria-label="Invitar por nombre de usuario" autoCapitalize="none" />
          <button className="btn-primary shrink-0" disabled={free <= 0 || invite.trim().length < 3}>Invitar</button>
        </form>
        <p className="text-xs text-muted m-0">{free > 0 ? `Quedan ${free} ${free === 1 ? 'cupo' : 'cupos'}.` : 'Máximo de 7 integrantes alcanzado.'}</p>
      </section>

      <section className="card">
        <div className="flex justify-between items-center"><span className="eyebrow">Asistencia de hoy</span><span className="text-xs text-muted">{trainedCount} de {members.length}</span></div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2.5">
          {members.map(({ profile: p }) => (
            <div key={p.id} className="flex flex-col items-center gap-1.5 text-xs text-center min-w-0">
              <Avatar profile={p} size={46} ring={att[p.id]} />
              <span className="truncate max-w-full">{p.id === user.id ? 'Tú' : p.display_name.split(' ')[0]}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${att[p.id] ? 'text-ok' : 'text-muted'}`}>{att[p.id] ? 'Entrenó' : 'Pendiente'}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="flex justify-between items-center"><span className="eyebrow">Días entrenados esta semana</span><span className="text-xs text-muted">se reinicia el lunes</span></div>
        <div className="flex flex-col gap-2.5">
          {ranked.map(({ profile: p }, i) => {
            const n = week[p.id] || 0
            return (
              <div key={p.id} className="grid grid-cols-[18px_88px_1fr_22px] gap-2.5 items-center text-sm">
                <span className="num text-xs text-muted">{i + 1}</span>
                <span className={`truncate ${p.id === user.id ? 'text-accent font-bold' : ''}`}>{p.id === user.id ? 'Tú' : p.display_name.split(' ')[0]}</span>
                <span className="h-2.5 bg-surface2 rounded-full overflow-hidden"><span className="block h-full bg-accent rounded-full transition-all" style={{ width: `${n / 7 * 100}%` }} /></span>
                <span className="num text-right">{n}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="card">
        <span className="eyebrow">Rutinas compartidas para hoy</span>
        {shared.length === 0 && <p className="text-sm text-muted m-0">Nadie ha compartido rutina hoy. Si van juntos al gym, comparte la tuya.</p>}
        {shared.map(s => (
          <div key={s.id} className="flex items-center justify-between gap-3 bg-surface2 rounded-xl px-3.5 py-3">
            <div className="min-w-0"><div className="font-bold truncate">{s.routine?.name || 'Rutina'}</div>
              <div className="text-xs text-muted">{s.sharer?.id === user.id ? 'Tú' : s.sharer?.display_name}{s.meet_time ? ` · ${s.meet_time.slice(0, 5)}` : ''}</div></div>
            <button className="chip chip-on shrink-0" onClick={() => nav(`/entrenar/sesion?rutina=${s.routine_id}`)}>Usar</button>
          </div>
        ))}
        {shareForm.open ? (
          <form className="flex flex-col gap-2" onSubmit={shareRoutine}>
            <select className="field" value={shareForm.routine} onChange={e => setShareForm(f => ({ ...f, routine: e.target.value }))} aria-label="Rutina a compartir">
              <option value="">Elige una de tus rutinas</option>
              {myRoutines.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <label className="text-xs text-muted">Hora para verse<input type="time" className="field mt-1" value={shareForm.time} onChange={e => setShareForm(f => ({ ...f, time: e.target.value }))} /></label>
            <div className="flex gap-2"><button type="button" className="btn-ghost flex-1" onClick={() => setShareForm(f => ({ ...f, open: false }))}>Cancelar</button><button className="btn-primary flex-1">Compartir</button></div>
          </form>
        ) : <button className="btn-ghost w-full" onClick={() => setShareForm(f => ({ ...f, open: true }))} disabled={!myRoutines.length}>{myRoutines.length ? 'Compartir mi rutina de hoy' : 'Crea una rutina para compartirla'}</button>}
      </section>

      <section className="card">
        <span className="eyebrow">Muro del squad</span>
        {feed.length === 0 && <p className="text-sm text-muted m-0">Cuando alguien termine un entrenamiento aparecerá aquí para que lo apoyen.</p>}
        <div className="flex flex-col divide-y divide-line">
          {feed.map(post => {
            const a = byId[post.author_id] || { id: post.author_id, display_name: 'Ex integrante' }
            let b = {}; try { b = JSON.parse(post.body || '{}') } catch { b = {} }
            const who = a.id === user.id ? 'Tú' : a.display_name
            const text = post.kind === 'workout_done'
              ? <><b>{who}</b> completó <b>{b.routine}</b> · {b.exercises} ejercicios · {tons(b.volume_kg || 0)} t
                  {b.prs?.length > 0 && <span className="block mt-1.5 text-accent font-semibold">🏆 {b.prs.length === 1 ? 'Nuevo récord' : `${b.prs.length} récords`}: {b.prs.map(p => `${p.name} ${toUnit(Number(p.kg), profile.unit)} ${profile.unit}`).join(' · ')}</span>}</>
              : post.kind === 'routine_shared'
                ? <><b>{who}</b> compartió <b>{b.routine}</b> para hoy{b.time ? ` a las ${b.time}` : ''}</>
                : <><b>{who}</b> {post.body}</>
            return (
              <div key={post.id} className="flex gap-3 py-3.5 first:pt-0">
                <Avatar profile={a} size={36} />
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <p className="text-sm m-0">{text}</p>
                  <span className="text-xs text-muted">{timeAgo(post.created_at)}</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {EMOJIS.map(e => {
                      const n = post.reactions.filter(r => r.emoji === e).length
                      const mine = post.reactions.some(r => r.emoji === e && r.user_id === user.id)
                      return (
                        <button key={e} aria-pressed={mine} aria-label={`Reaccionar ${e}`} onClick={() => react(post, e)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] ${mine ? 'bg-accent/15 ring-1 ring-accent' : 'bg-surface2'}`}>
                          {e}<span className={`num text-xs ${mine ? 'text-accent' : 'text-muted'}`}>{n}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {confirmLeave
        ? <div className="flex gap-2"><button className="btn-ghost flex-1" onClick={() => setConfirmLeave(false)}>Quedarme</button><button className="btn flex-1 bg-danger text-bg" onClick={leave}>Sí, salir</button></div>
        : <button className="text-sm text-danger font-semibold py-2" onClick={() => setConfirmLeave(true)}>Salir del squad</button>}
    </>
  )
}
