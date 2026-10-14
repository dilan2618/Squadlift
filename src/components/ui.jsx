import { useEffect, useState } from 'react'
import { initials, colorFor } from '../lib/utils'
import { cv } from '../lib/theme'

export function Avatar({ profile, size = 36, ring = false, dim = false }) {
  const style = { width: size, height: size, fontSize: size * 0.36 }
  const cls = `rounded-full grid place-items-center font-bold shrink-0 overflow-hidden ${ring ? 'ring-2 ring-ok' : ''} ${dim ? 'opacity-45' : ''}`
  if (profile?.avatar_url) return <img src={profile.avatar_url} alt="" className={cls + ' object-cover'} style={style} />
  return (
    <div className={cls} style={{ ...style, background: colorFor(profile?.id), color: '#14161c' }}>
      {initials(profile?.display_name || '?')}
    </div>
  )
}

export function Ring({ value, max, size = 132, color = cv('accent'), children }) {
  const C = 2 * Math.PI * 54, pct = max ? Math.min(value / max, 1) : 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r="54" fill="none" style={{ stroke: cv('surface2') }} strokeWidth="10" />
        <circle cx="60" cy="60" r="54" fill="none" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ stroke: color, transition: 'stroke-dashoffset .6s, stroke .3s' }} />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">{children}</div>
    </div>
  )
}

export function PageHeader({ eyebrow, title, right }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex flex-col gap-1 min-w-0">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="h1 break-words">{title}</h1>
      </div>
      {right}
    </div>
  )
}

export function Empty({ title, text, action }) {
  return (
    <div className="card items-start">
      <span className="font-bold">{title}</span>
      <p className="text-sm text-muted m-0">{text}</p>
      {action}
    </div>
  )
}

let pushToast = () => {}
export const toast = (msg, kind = 'ok') => pushToast({ msg, kind, id: Date.now() })
export function Toaster() {
  const [t, setT] = useState(null)
  useEffect(() => { pushToast = setT }, [])
  useEffect(() => { if (!t) return; const h = setTimeout(() => setT(null), 2800); return () => clearTimeout(h) }, [t])
  if (!t) return null
  return (
    <div role="status" className={`fixed left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl font-bold text-sm text-center max-w-[calc(100%-32px)] ${t.kind === 'err' ? 'bg-danger text-bg' : 'bg-ok text-bg'}`}
      style={{ top: 'calc(12px + env(safe-area-inset-top, 0px))' }}>{t.msg}</div>
  )
}

/** Gráfico de línea con área, escala única para marcas y etiquetas */
export function LineChart({ data, labels }) {
  if (data.length < 2) return <p className="text-sm text-muted m-0">Necesitas al menos 2 semanas registradas para ver la línea.</p>
  const W = 340, H = 170, pl = 38, pr = 14, pt = 14, pb = 26
  let min = Math.floor(Math.min(...data) / 5) * 5, max = Math.ceil(Math.max(...data) / 5) * 5
  if (max === min) { max += 5; min = Math.max(0, min - 5) }
  const x = i => pl + i * (W - pl - pr) / (data.length - 1)
  const y = v => pt + (1 - (v - min) / (max - min)) * (H - pt - pb)
  const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = data.length - 1
  const step = Math.max(1, Math.ceil(data.length / 4))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: cv('accent'), stopOpacity: .35 }} /><stop offset="1" style={{ stopColor: cv('accent'), stopOpacity: 0 }} /></linearGradient></defs>
      {[min, (min + max) / 2, max].map(t => (
        <g key={t}><line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} style={{ stroke: cv('line') }} strokeDasharray="2 4" />
          <text x={pl - 6} y={y(t) + 3} textAnchor="end" style={{ fill: cv('muted') }} fontSize="10" fontFamily="IBM Plex Mono, monospace">{Math.round(t)}</text></g>
      ))}
      <polygon points={`${x(0)},${H - pb} ${pts} ${x(last)},${H - pb}`} fill="url(#lg)" />
      <polyline points={pts} fill="none" style={{ stroke: cv('accent') }} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(data[last])} r="5" style={{ fill: cv('accent'), stroke: cv('bg') }} strokeWidth="2" />
      {labels.map((l, i) => (i % step === 0 || i === last) && (
        <text key={i} x={x(i)} y={H - 8} textAnchor="middle" style={{ fill: cv('muted') }} fontSize="10" fontFamily="IBM Plex Mono, monospace">{l}</text>
      ))}
    </svg>
  )
}

export function BarChart({ data, labels }) {
  if (!data.length) return null
  const W = 340, H = 150, pl = 38, pr = 6, pt = 10, pb = 24
  const max = Math.max(1, Math.ceil(Math.max(...data) / 2) * 2)
  const bw = (W - pl - pr) / data.length
  const y = v => pt + (1 - v / max) * (H - pt - pb)
  const step = Math.max(1, Math.ceil(data.length / 4))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
      {[0, max / 2, max].map(t => (
        <g key={t}><line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} style={{ stroke: cv('line') }} strokeDasharray="2 4" />
          <text x={pl - 6} y={y(t) + 3} textAnchor="end" style={{ fill: cv('muted') }} fontSize="10" fontFamily="IBM Plex Mono, monospace">{+t.toFixed(1)}</text></g>
      ))}
      {data.map((v, i) => (
        <rect key={i} x={pl + i * bw + bw * .18} y={y(v)} width={bw * .64} height={Math.max(0, y(0) - y(v))} rx="4"
          style={{ fill: i === data.length - 1 ? cv('accent') : cv('surface3') }} />
      ))}
      {labels.map((l, i) => (i % step === 0 || i === data.length - 1) && (
        <text key={i} x={pl + i * bw + bw / 2} y={H - 7} textAnchor="middle" style={{ fill: cv('muted') }} fontSize="10" fontFamily="IBM Plex Mono, monospace">{l}</text>
      ))}
    </svg>
  )
}
