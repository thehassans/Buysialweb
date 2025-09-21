import React, { useEffect, useMemo, useState } from 'react'
import { API_BASE, apiGet } from '../../api'
import { io } from 'socket.io-client'

export default function InvestorDashboard(){
  const [isMobile, setIsMobile] = useState(()=> (typeof window!=='undefined' ? window.innerWidth <= 768 : false))
  const [me, setMe] = useState(null)
  const [metrics, setMetrics] = useState({ currency:'SAR', investmentAmount:0, unitsSold:0, totalProfit:0, totalSaleValue:0, breakdown:[] })
  const [loading, setLoading] = useState(false)

  useEffect(()=>{
    function onResize(){ setIsMobile(window.innerWidth <= 768) }
    window.addEventListener('resize', onResize)
    return ()=> window.removeEventListener('resize', onResize)
  },[])

  useEffect(()=>{
    async function load(){
      try{ const { user } = await apiGet('/api/users/me'); setMe(user||null) }catch{ setMe(null) }
      try{
        setLoading(true)
        const m = await apiGet('/api/users/investors/me/metrics')
        setMetrics({
          currency: m.currency || 'SAR',
          investmentAmount: Number(m.investmentAmount||0),
          unitsSold: Number(m.unitsSold||0),
          totalProfit: Number(m.totalProfit||0),
          totalSaleValue: Number(m.totalSaleValue||0),
          breakdown: Array.isArray(m.breakdown) ? m.breakdown : []
        })
      }catch{ setMetrics({ currency:'SAR', investmentAmount:0, unitsSold:0, totalProfit:0, totalSaleValue:0, breakdown:[] }) }
      finally{ setLoading(false) }
    }
    load()
    // Socket live updates
    let socket
    try{
      const token = localStorage.getItem('token') || ''
      socket = io(API_BASE || undefined, { path: '/socket.io', transports: ['websocket','polling'], auth: { token } })
      const refresh = ()=>{ load() }
      // Orders in the workspace changed (ship/deliver/return/settle/created)
      socket.on('orders.changed', refresh)
      // Direct investor updates (profile/assignment changed)
      socket.on('investor.updated', refresh)
    }catch{}
    return ()=>{
      try{ socket && socket.off('orders.changed') }catch{}
      try{ socket && socket.off('investor.updated') }catch{}
      try{ socket && socket.disconnect() }catch{}
    }
  }, [])

  return (
    <div className="section">
      <div className="page-header">
        <div>
          <div className="page-title gradient heading-purple">Investor Dashboard</div>
          <div className="page-subtitle">Overview of your investments and performance</div>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpis">
        <div className="kpi">
          <div className="label">Total Investment</div>
          <div className="value">{metrics.currency} {metrics.investmentAmount.toFixed(2)}</div>
        </div>
        <div className="kpi">
          <div className="label">Units Sold</div>
          <div className="value">{metrics.unitsSold}</div>
        </div>
        <div className="kpi">
          <div className="label">Total Sale Value</div>
          <div className="value">{metrics.currency} {metrics.totalSaleValue.toFixed(2)}</div>
        </div>
        <div className="kpi">
          <div className="label">Total Profit</div>
          <div className="value">{metrics.currency} {metrics.totalProfit.toFixed(2)}</div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="card" style={{marginTop:12}}>
        <div className="card-header">
          <div className="card-title">Per-Product Breakdown</div>
          <div className="helper">Only shipped or delivered orders are counted</div>
        </div>
        <div style={{overflow:'auto'}}>
          <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0}}>
            <thead>
              <tr>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Product</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Units Sold</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Sale Value</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Profit</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{padding:'10px 12px', opacity:0.7}}>Loading…</td></tr>
              ) : metrics.breakdown.length === 0 ? (
                <tr><td colSpan={4} style={{padding:'10px 12px', opacity:0.7}}>No data</td></tr>
              ) : metrics.breakdown.map((row, idx) => (
                <tr key={idx} style={{borderTop:'1px solid var(--border)'}}>
                  <td style={{padding:'10px 12px'}}>{row.productName || '-'}</td>
                  <td style={{padding:'10px 12px'}}>{row.unitsSold || 0}</td>
                  <td style={{padding:'10px 12px'}}>{metrics.currency} {(Number(row.saleValue||0)).toFixed(2)}</td>
                  <td style={{padding:'10px 12px'}}>{metrics.currency} {(Number(row.profit||0)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
