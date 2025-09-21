import React, { useEffect, useState } from 'react'
import { API_BASE, apiGet, apiPost } from '../../api'
import { io } from 'socket.io-client'

export default function DriverDashboard(){
  const [assigned, setAssigned] = useState([])
  const [available, setAvailable] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingAvail, setLoadingAvail] = useState(false)
  const [city, setCity] = useState('')

  async function loadAssigned(){
    setLoading(true)
    try{ const data = await apiGet('/api/orders/driver/assigned'); setAssigned(data.orders||[]) }catch{ setAssigned([]) }
    finally{ setLoading(false) }
  }
  async function loadAvailable(){
    setLoadingAvail(true)
    try{ const q = city ? `?city=${encodeURIComponent(city)}` : '' ; const data = await apiGet(`/api/orders/driver/available${q}`); setAvailable(data.orders||[]) }catch{ setAvailable([]) }
    finally{ setLoadingAvail(false) }
  }
  useEffect(()=>{ loadAssigned() },[])
  useEffect(()=>{ loadAvailable() },[city])

  // Real-time updates: listen for order events targeted to this driver
  useEffect(()=>{
    let socket
    try{
      const token = localStorage.getItem('token') || ''
      socket = io(API_BASE || undefined, { path: '/socket.io', transports: ['websocket','polling'], auth: { token } })
      const onAssigned = (_payload)=>{ try{ loadAssigned(); loadAvailable() }catch{} }
      const onUpdated = (_payload)=>{ try{ loadAssigned() }catch{} }
      socket.on('order.assigned', onAssigned)
      socket.on('order.updated', onUpdated)
    }catch{}
    return ()=>{
      try{ socket && socket.off('order.assigned') }catch{}
      try{ socket && socket.off('order.updated') }catch{}
      try{ socket && socket.disconnect() }catch{}
    }
  },[])

  function fmtDate(s){ try{ return new Date(s).toLocaleString() }catch{ return '' } }
  function fmtPrice(o){
    try{
      const qty = Math.max(1, Number(o?.quantity||1))
      const price = Number(o?.productId?.price||0)
      const cur = o?.productId?.baseCurrency || 'SAR'
      const total = price * qty
      return `${cur} ${total.toFixed(2)}`
    }catch{ return 'SAR 0.00' }
  }
  function mapsUrl(o){
    const lat = o?.locationLat, lng = o?.locationLng
    if (typeof lat === 'number' && typeof lng === 'number'){
      return `https://www.google.com/maps?q=${lat},${lng}`
    }
    const addr = o?.customerAddress || o?.customerLocation || ''
    if (addr) return `https://www.google.com/maps?q=${encodeURIComponent(addr)}`
    return ''
  }
  function openMaps(o){ const url = mapsUrl(o); if (url) window.open(url, '_blank', 'noopener,noreferrer') }

  async function deliverOrder(o){
    try{
      const note = window.prompt('Add delivery note (optional):', '')
      const amtStr = window.prompt('Collected amount (optional):', '')
      const payload = {}
      if (note && note.trim()) payload.note = note.trim()
      const amt = Number(amtStr)
      if (!Number.isNaN(amt) && amtStr !== null && amtStr !== '') payload.collectedAmount = Math.max(0, amt)
      await apiPost(`/api/orders/${o._id||o.id}/deliver`, payload)
      await loadAssigned()
    }catch(e){ alert(e?.message || 'Failed to mark delivered') }
  }
  async function cancelOrder(o){
    try{
      const reason = window.prompt('Reason for cancellation:', '')
      if (reason === null) return
      await apiPost(`/api/orders/${o._id||o.id}/cancel`, { reason })
      await loadAssigned(); await loadAvailable()
    }catch(e){ alert(e?.message || 'Failed to cancel order') }
  }

  return (
    <div className="section" style={{display:'grid', gap:12}}>
      <div className="page-header">
        <div>
          <div className="page-title gradient heading-blue">My Orders</div>
          <div className="page-subtitle">View orders assigned to you and available orders in your country. Filter by your city if needed.</div>
        </div>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <input className="input" placeholder="Filter available by city (optional)" value={city} onChange={e=>setCity(e.target.value)} style={{maxWidth:260}}/>
        </div>
      </div>

      <div className="card" style={{display:'grid', gap:12}}>
        <div className="card-header">
          <div className="card-title">Assigned to Me</div>
        </div>
        <div style={{overflow:'auto'}}>
          <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0}}>
            <thead>
              <tr>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Customer</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Country</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>City</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Details</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Price</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Status</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Location</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Created</th>
                <th style={{textAlign:'right', padding:'10px 12px'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{padding:12, opacity:0.7}}>Loading...</td></tr>
              ) : assigned.length === 0 ? (
                <tr><td colSpan={9} style={{padding:12, opacity:0.7}}>No assigned orders</td></tr>
              ) : (
                assigned.map(o => (
                  <tr key={o._id||o.id} style={{borderTop:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 12px'}}>{o.customerPhone}</td>
                    <td style={{padding:'10px 12px'}}>{o.orderCountry||'-'}</td>
                    <td style={{padding:'10px 12px'}}>{o.city||'-'}</td>
                    <td style={{padding:'10px 12px', maxWidth:320, overflow:'hidden', textOverflow:'ellipsis'}} title={o.details}>{o.details}</td>
                    <td style={{padding:'10px 12px'}}>{fmtPrice(o)}</td>
                    <td style={{padding:'10px 12px'}}>{o.shipmentStatus||o.status||'-'}</td>
                    <td style={{padding:'10px 12px'}}>
                      {(() => {
                        const url = mapsUrl(o)
                        return url ? <button className="btn secondary small" onClick={()=>openMaps(o)} title="Open in Google Maps">Open Maps</button> : <span className="helper">No location</span>
                      })()}
                    </td>
                    <td style={{padding:'10px 12px'}}>{fmtDate(o.createdAt)}</td>
                    <td style={{padding:'10px 12px', textAlign:'right'}}>
                      <div style={{display:'flex', gap:6, justifyContent:'flex-end'}}>
                        <button className="btn small" onClick={()=>deliverOrder(o)} title="Mark Delivered">✓ Deliver</button>
                        <button className="btn danger small" onClick={()=>cancelOrder(o)} title="Cancel Order">Cancel</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{display:'grid', gap:12}}>
        <div className="card-header">
          <div className="card-title">Available in My Country</div>
        </div>
        <div style={{overflow:'auto'}}>
          <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0}}>
            <thead>
              <tr>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Customer</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Country</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>City</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Details</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Price</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Created</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Location</th>
              </tr>
            </thead>
            <tbody>
              {loadingAvail ? (
                <tr><td colSpan={7} style={{padding:12, opacity:0.7}}>Loading...</td></tr>
              ) : available.length === 0 ? (
                <tr><td colSpan={7} style={{padding:12, opacity:0.7}}>No available orders</td></tr>
              ) : (
                available.map(o => (
                  <tr key={o._id||o.id} style={{borderTop:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 12px'}}>{o.customerPhone}</td>
                    <td style={{padding:'10px 12px'}}>{o.orderCountry||'-'}</td>
                    <td style={{padding:'10px 12px'}}>{o.city||'-'}</td>
                    <td style={{padding:'10px 12px', maxWidth:320, overflow:'hidden', textOverflow:'ellipsis'}} title={o.details}>{o.details}</td>
                    <td style={{padding:'10px 12px'}}>{fmtPrice(o)}</td>
                    <td style={{padding:'10px 12px'}}>{fmtDate(o.createdAt)}</td>
                    <td style={{padding:'10px 12px'}}>
                      {(() => {
                        const url = mapsUrl(o)
                        return url ? <button className="btn secondary small" onClick={()=>openMaps(o)} title="Open in Google Maps">Open Maps</button> : <span className="helper">No location</span>
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
