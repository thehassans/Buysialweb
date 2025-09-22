import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE, apiGet } from '../../api'
import { io } from 'socket.io-client'

export default function AgentDashboard(){
  const navigate = useNavigate()
  const me = useMemo(()=>{
    try{ return JSON.parse(localStorage.getItem('me')||'{}') }catch{ return {} }
  },[])
  const [loading, setLoading] = useState(true)
  const [assignedCount, setAssignedCount] = useState(0)
  const [orders, setOrders] = useState([])
  const [avgResponseSeconds, setAvgResponseSeconds] = useState(null)
  const [ordersSubmittedOverride, setOrdersSubmittedOverride] = useState(null)

  // Load metrics for the signed-in agent
  async function load(){
    setLoading(true)
    try{
      const [chats, ordRes, perf] = await Promise.all([
        apiGet('/api/wa/chats').catch(()=>[]),
        apiGet('/api/orders').catch(()=>({ orders: [] })),
        apiGet('/api/users/agents/me/performance').catch(()=>({})),
      ])
      const chatList = Array.isArray(chats) ? chats : []
      const allOrders = Array.isArray(ordRes?.orders) ? ordRes.orders : []
      setAssignedCount(chatList.length)
      setOrders(allOrders)
      if (typeof perf?.avgResponseSeconds === 'number') setAvgResponseSeconds(perf.avgResponseSeconds)
      if (typeof perf?.ordersSubmitted === 'number') setOrdersSubmittedOverride(perf.ordersSubmitted)
    }finally{ setLoading(false) }
  }

  useEffect(()=>{ load() },[])

  // Live refresh on order changes across the workspace
  useEffect(()=>{
    let socket
    try{
      const token = localStorage.getItem('token') || ''
      socket = io(API_BASE || undefined, { path: '/socket.io', transports: ['websocket','polling'], auth: { token } })
      const refresh = ()=>{ load() }
      socket.on('orders.changed', refresh)
    }catch{}
    return ()=>{
      try{ socket && socket.off('orders.changed') }catch{}
      try{ socket && socket.disconnect() }catch{}
    }
  },[])

  // Derived metrics
  const ordersSubmitted = ordersSubmittedOverride != null ? ordersSubmittedOverride : orders.length
  const shipped = orders.filter(o => (o?.status||'').toLowerCase()==='shipped')
  const inTransit = orders.filter(o => (o?.shipmentStatus||'').toLowerCase()==='in_transit')
  const pending = orders.filter(o => (o?.status||'').toLowerCase()==='pending')
  const valueOf = (o)=> (o?.productId?.price || 0) * Math.max(1, Number(o?.quantity||1))
  const baseOf = (o)=> (o?.productId?.baseCurrency || 'SAR')
  const commissionPct = 0.08
  function commissionByCurrency(list){
    const sums = { AED:0, OMR:0, SAR:0, BHD:0 }
    for (const o of list){
      const cur = ['AED','OMR','SAR','BHD'].includes(baseOf(o)) ? baseOf(o) : 'SAR'
      sums[cur] += valueOf(o) * commissionPct
    }
    return sums
  }
  const totalByCur = commissionByCurrency(shipped)
  // Upcoming = Pending + In Transit (so new orders affect the wallet immediately)
  const upcomingByCur = commissionByCurrency([...pending, ...inTransit])
  const totalIncome = Object.values(totalByCur).reduce((a,b)=>a+b,0)
  const upcomingIncome = Object.values(upcomingByCur).reduce((a,b)=>a+b,0)

  // FX: PKR conversion (configurable via localStorage key 'fx_pkr')
  const defaultFx = { AED: 76, OMR: 726, SAR: 72, BHD: 830 } // approx; can be updated in settings
  let fx = defaultFx
  try{
    const saved = JSON.parse(localStorage.getItem('fx_pkr')||'null')
    if (saved && typeof saved==='object') fx = { ...defaultFx, ...saved }
  }catch{}
  const toPKR = (sums)=> Math.round(
    (sums.AED||0)*fx.AED + (sums.OMR||0)*fx.OMR + (sums.SAR||0)*fx.SAR + (sums.BHD||0)*fx.BHD
  )
  const totalPKR = toPKR(totalByCur)
  const upcomingPKR = toPKR(upcomingByCur)

  return (
    <div className="grid responsive-grid max-w-screen-2xl mx-auto px-3 md:px-6 gap-3 md:gap-4">
      <div className="page-header">
        <div>
          <div className="page-title gradient heading-green">Agent Dashboard</div>
          <div className="page-subtitle">Your performance and earnings overview</div>
        </div>
      </div>

      {/* Top summary cards */}
      <div className="card-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <MetricCard
          title="Assigned Chats"
          value={assignedCount}
          hint="Chats currently assigned to you"
          icon="💬"
          actionLabel="Go to chats"
          onAction={()=> navigate('/agent/inbox/whatsapp')}
        />
        <MetricCard title="Orders Submitted" value={ordersSubmitted} hint="Orders you created" icon="🧾" />
        <MetricCard title="Avg. Response Time" value={avgResponseSeconds!=null? formatDuration(avgResponseSeconds) : '—'} hint="Time to first reply on new chats" icon="⏱️" />
        <MetricCard
          title="Total Income"
          value={<CurrencyBreakdown rows={[
            { code:'AED', amount: totalByCur.AED },
            { code:'OMR', amount: totalByCur.OMR },
            { code:'SAR', amount: totalByCur.SAR },
            { code:'BHD', amount: totalByCur.BHD },
          ]} />}
          hint={`≈ PKR ${totalPKR.toLocaleString()} (8% commission on shipped orders)`}
          icon="💰"
        />
        <MetricCard
          title="Upcoming Income"
          value={<CurrencyBreakdown rows={[
            { code:'AED', amount: upcomingByCur.AED },
            { code:'OMR', amount: upcomingByCur.OMR },
            { code:'SAR', amount: upcomingByCur.SAR },
            { code:'BHD', amount: upcomingByCur.BHD },
          ]} />}
          hint={`≈ PKR ${upcomingPKR.toLocaleString()} (8% on pending + in transit)`}
          icon="📦"
        />
      </div>

      {/* Revenue chart */}
      <div className="card shadow-sm" style={{display:'grid', gap:12}}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center rounded-xl" style={{width:36,height:36,background:'linear-gradient(135deg,#3b82f6,#8b5cf6)',color:'#fff'}} aria-hidden>
              <UIIcon name="chart" />
            </div>
            <div>
              <div style={{fontWeight:800}}>Earnings Overview</div>
              <div className="helper">Commission at 8% of order value</div>
            </div>
          </div>
          <button className="btn secondary" onClick={load} disabled={loading}>{loading? 'Refreshing…' : 'Refresh'}</button>
        </div>
        <MiniBarChart
          items={[
            { label:'Upcoming (PKR)', value: upcomingPKR, color:'#f59e0b' },
            { label:'Total (PKR)', value: totalPKR, color:'#10b981' },
          ]}
        />
      </div>
    </div>
  )
}

function UIIcon({ name, className }){
  const props = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', className }
  if (name === 'chat') return (
    <svg {...props}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  )
  if (name === 'receipt') return (
    <svg {...props}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10"/><path d="M7 12h10"/><path d="M7 16h6"/></svg>
  )
  if (name === 'timer') return (
    <svg {...props}><circle cx="12" cy="13" r="8"/><path d="M12 9v5l3 2"/><path d="M9 2h6"/></svg>
  )
  if (name === 'wallet') return (
    <svg {...props}><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M16 10h4"/></svg>
  )
  if (name === 'box') return (
    <svg {...props}><path d="M3 7l9-5 9 5v10l-9 5-9-5z"/><path d="M3 7l9 5 9-5"/></svg>
  )
  if (name === 'chart') return (
    <svg {...props}><path d="M3 3v18h18"/><path d="M7 17l4-6 3 4 5-8"/></svg>
  )
  // default dot
  return (<svg {...props}><circle cx="12" cy="12" r="3"/></svg>)
}

function mapIconKind(icon){
  const s = String(icon||'')
  if (s.includes('💬')) return 'chat'
  if (s.includes('🧾')) return 'receipt'
  if (s.includes('⏱')) return 'timer'
  if (s.includes('💰')) return 'wallet'
  if (s.includes('📦')) return 'box'
  return 'dot'
}

function iconBg(kind){
  switch(kind){
    case 'chat': return 'linear-gradient(135deg,#06b6d4,#6366f1)'
    case 'receipt': return 'linear-gradient(135deg,#d946ef,#8b5cf6)'
    case 'timer': return 'linear-gradient(135deg,#f97316,#fb7185)'
    case 'wallet': return 'linear-gradient(135deg,#22c55e,#0ea5e9)'
    case 'box': return 'linear-gradient(135deg,#f59e0b,#ef4444)'
    default: return 'linear-gradient(135deg,#64748b,#94a3b8)'
  }
}

function MetricCard({ title, value, hint, icon, actionLabel, onAction }){
  const kind = mapIconKind(icon)
  return (
    <div className="card flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className="grid place-items-center" style={{width:42, height:42, borderRadius:12, background: iconBg(kind), color:'#fff'}} aria-hidden>
        <UIIcon name={kind} />
      </div>
      <div className="grid gap-0.5">
        <div className="label" style={{fontSize:13}}>{title}</div>
        <div style={{fontSize:20, fontWeight:800}}>{value}</div>
        {hint && <div className="helper" style={{fontSize:11}}>{hint}</div>}
      </div>
      {actionLabel && onAction && (
        <div className="ml-auto">
          <button className="btn secondary small" onClick={onAction}>{actionLabel}</button>
        </div>
      )}
    </div>
  )
}

function MiniBarChart({ items }){
  const max = Math.max(1, ...items.map(i=>i.value||0))
  return (
    <div className="grid gap-3">
      <div className="grid items-end rounded-lg" style={{gridTemplateColumns:`repeat(${items.length}, 1fr)`, gap:16, height:180, background:'var(--panel-2)', padding:'12px'}}>
        {items.map((it,idx)=>{
          const h = Math.max(6, Math.round((it.value||0)/max*160))
          return (
            <div key={idx} className="grid content-end justify-items-center gap-2">
              <div style={{width:'80%', height:h, background:it.color, borderRadius:6, transition:'transform 150ms ease', cursor:'pointer'}} title={`${it.label}: ${formatCurrency(it.value||0)}`}
                onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
              ></div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-center gap-4 flex-wrap">
        {items.map((it,idx)=>(<div key={idx} className="flex items-center gap-2 text-xs">
            <div style={{width:12, height:12, borderRadius:4, background:it.color}}></div>
            <div>{it.label}: <strong style={{color:'var(--fg)'}}>{formatCurrency(it.value||0)}</strong></div>
          </div>))}
      </div>
    </div>
  )
}

function formatCurrency(v){
  try{
    return new Intl.NumberFormat('en-US', { style:'currency', currency:'PKR', maximumFractionDigits:0 }).format(v||0)
  }catch{
    return `PKR ${Math.round(v||0).toLocaleString()}`
  }
}

function formatDuration(seconds){
  const s = Math.max(0, Math.round(seconds||0))
  const m = Math.floor(s/60), r = s%60
  if (m>0) return `${m}m ${r}s`
  return `${r}s`
}

function fmt(n){
  const v = Math.round(n||0)
  return v.toLocaleString()
}

function CurrencyBreakdown({ rows }){
  return (
    <div style={{display:'grid', gap:4, fontSize:18}}>
      {rows.map(r => (
        <div key={r.code} style={{display:'flex', justifyContent:'space-between'}}>
          <span style={{opacity:.9}}>{r.code}</span>
          <strong>{fmt(r.amount)}</strong>
        </div>
      ))}
    </div>
  )
}
