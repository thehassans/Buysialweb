import React, { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../../api'

export default function Reports(){
  const [range, setRange] = useState('7d') // 7d | 30d | 90d
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const ranges = [
    { k:'7d', label:'Last 7 Days' },
    { k:'30d', label:'Last 30 Days' },
    { k:'90d', label:'Last 90 Days' },
  ]

  async function load(r=range){
    setLoading(true)
    try{
      const res = await apiGet(`/api/orders/analytics/summary?range=${encodeURIComponent(r)}`)
      setData(res)
    }catch(err){
      console.error('Failed to load reports', err)
    }finally{
      setLoading(false)
    }
  }
  useEffect(()=>{ load('7d') },[])
  useEffect(()=>{ if (range) load(range) },[range])

  const cards = useMemo(()=>{
    const d = data || {}
    const c = d.counts || {}
    const t = d.totals || {}
    return [
      { title:'Total Orders', value: c.totalOrders||0, helper: 'All orders created in range', icon:'🧾' },
      { title:'Shipped', value: c.shipped||0, helper: 'Orders marked shipped', icon:'🚚' },
      { title:'Delivered', value: c.delivered||0, helper: 'Orders delivered', icon:'📦' },
      { title:'Returned', value: c.returned||0, helper: 'Orders returned', icon:'↩️' },
      { title:'COD Value', value: fmtCurrency(t.codTotal||0), helper: 'Sum of COD amounts', icon:'💵' },
      { title:'Collected Cash', value: fmtCurrency(t.collectedTotal||0), helper: 'Cash collected', icon:'🏦' },
      { title:'Shipping Cost', value: fmtCurrency(t.shippingTotal||0), helper: 'Courier charges', icon:'✈️' },
      { title:"Agent Commission (8%)", value: fmtCurrency(t.agentCommission||0), helper: 'Commission on shipped orders', icon:'🧑‍💼' },
      { title:'Gross Profit', value: fmtCurrency(t.grossProfit||0), helper: 'Collected - Shipping - Commission', icon:'📈' },
    ]
  },[data])

  return (
    <div className="grid" style={{gap:12}}>
      <div className="card" style={{display:'grid', gap:12}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#0ea5e9,#22c55e)',display:'grid',placeItems:'center',color:'#fff',fontWeight:800}}>📊</div>
            <div>
              <div style={{fontWeight:800}}>Business Reports</div>
              <div className="helper">Weekly, monthly and quarterly performance overview</div>
            </div>
          </div>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            {ranges.map(r => (
              <button key={r.k} className="btn secondary" onClick={()=> setRange(r.k)} disabled={loading} style={{background: range===r.k? 'var(--nav-active-bg)':'var(--panel)'}}>{r.label}</button>
            ))}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12}}>
          {cards.map((kpi, i)=> (
            <div key={i} className="card" style={{display:'grid', gap:6}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <div className="label" style={{fontSize:12}}>{kpi.title}</div>
                <div aria-hidden>{kpi.icon}</div>
              </div>
              <div style={{fontSize:22, fontWeight:800}}>{kpi.value}</div>
              <div className="helper">{kpi.helper}</div>
            </div>
          ))}
        </div>

        {/* Breakdown Table */}
        <div className="card" style={{display:'grid', gap:12}}>
          <div className="card-title">Financial Summary</div>
          <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0}}>
            <thead>
              <tr>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Metric</th>
                <th style={{textAlign:'right', padding:'10px 12px'}}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <Row name="COD Value" v={data?.totals?.codTotal} />
              <Row name="Collected Cash" v={data?.totals?.collectedTotal} />
              <Row name="Shipping Cost" v={data?.totals?.shippingTotal} />
              <Row name="Agent Commission (8%)" v={data?.totals?.agentCommission} />
              <tr style={{borderTop:'1px solid var(--border)'}}>
                <td style={{padding:'10px 12px', fontWeight:800}}>Gross Profit</td>
                <td style={{padding:'10px 12px', textAlign:'right', fontWeight:800}}>{fmtCurrency(data?.totals?.grossProfit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Row({ name, v }){
  return (
    <tr>
      <td style={{padding:'10px 12px'}}>{name}</td>
      <td style={{padding:'10px 12px', textAlign:'right'}}>{fmtCurrency(v)}</td>
    </tr>
  )
}

function fmtCurrency(n){
  const v = Number(n||0)
  try{ return new Intl.NumberFormat(undefined, { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(v) }catch{ return `$${Math.round(v).toLocaleString()}` }
}
