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
    <div className="grid responsive-grid" style={{gap:12}}>
      <div className="page-header">
        <div>
          <div className="page-title gradient heading-green">Agent Dashboard</div>
          <div className="page-subtitle">Your performance and earnings overview</div>
        </div>
      </div>

      {/* Top summary cards */}
      <div className="card-grid">
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
      <div className="card" style={{display:'grid', gap:12}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:32,height:32,borderRadius:8,background:'linear-gradient(135deg,#3b82f6,#8b5cf6)',display:'grid',placeItems:'center',color:'#fff',fontWeight:800, fontSize:18}}>📈</div>
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

function MetricCard({ title, value, hint, icon, actionLabel, onAction }){
  return (
    <div className="card" style={{display:'flex', alignItems:'center', gap:14}}>
      <div style={{width:42, height:42, borderRadius:999, background:'var(--panel-2)', display:'grid', placeItems:'center', fontSize:20, flexShrink:0}}>
        {icon}
      </div>
      <div style={{display:'grid', gap:2}}>
        <div className="label" style={{fontSize:13}}>{title}</div>
        <div style={{fontSize:20, fontWeight:800}}>{value}</div>
        {hint && <div className="helper" style={{fontSize:11}}>{hint}</div>}
      </div>
      {actionLabel && onAction && (
        <div style={{marginLeft:'auto'}}>
          <button className="btn secondary small" onClick={onAction}>{actionLabel}</button>
        </div>
      )}
    </div>
  )
}

function MiniBarChart({ items }){
  const max = Math.max(1, ...items.map(i=>i.value||0))
  return (
    <div style={{display:'grid', gap:12}}>
      <div style={{display:'grid', gridTemplateColumns:`repeat(${items.length}, 1fr)`, gap:16, alignItems:'end', height:180, background:'var(--panel-2)', padding:'12px', borderRadius:8}}>
        {items.map((it,idx)=>{
          const h = Math.max(6, Math.round((it.value||0)/max*160))
          return (
            <div key={idx} style={{display:'grid', alignContent:'end', justifyItems:'center', gap:8}}>
              <div style={{width:'80%', height:h, background:it.color, borderRadius:6, transition:'transform 150ms ease', cursor:'pointer'}} title={`${it.label}: ${formatCurrency(it.value||0)}`}
                onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
              ></div>
            </div>
          )
        })}
      </div>
      <div style={{display:'flex', justifyContent:'center', gap:16, flexWrap:'wrap'}}>
        {items.map((it,idx)=>(<div key={idx} style={{display:'flex', alignItems:'center', gap:8, fontSize:12}}>
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
