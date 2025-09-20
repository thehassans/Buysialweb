import React, { useEffect, useState } from 'react'
import { apiGet } from '../../api'

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

  function fmtDate(s){ try{ return new Date(s).toLocaleString() }catch{ return '' } }

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
                <th style={{textAlign:'left', padding:'10px 12px'}}>Status</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{padding:12, opacity:0.7}}>Loading...</td></tr>
              ) : assigned.length === 0 ? (
                <tr><td colSpan={6} style={{padding:12, opacity:0.7}}>No assigned orders</td></tr>
              ) : (
                assigned.map(o => (
                  <tr key={o._id||o.id} style={{borderTop:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 12px'}}>{o.customerPhone}</td>
                    <td style={{padding:'10px 12px'}}>{o.orderCountry||'-'}</td>
                    <td style={{padding:'10px 12px'}}>{o.city||'-'}</td>
                    <td style={{padding:'10px 12px', maxWidth:320, overflow:'hidden', textOverflow:'ellipsis'}} title={o.details}>{o.details}</td>
                    <td style={{padding:'10px 12px'}}>{o.shipmentStatus||o.status||'-'}</td>
                    <td style={{padding:'10px 12px'}}>{fmtDate(o.createdAt)}</td>
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
                <th style={{textAlign:'left', padding:'10px 12px'}}>Created</th>
              </tr>
            </thead>
            <tbody>
              {loadingAvail ? (
                <tr><td colSpan={5} style={{padding:12, opacity:0.7}}>Loading...</td></tr>
              ) : available.length === 0 ? (
                <tr><td colSpan={5} style={{padding:12, opacity:0.7}}>No available orders</td></tr>
              ) : (
                available.map(o => (
                  <tr key={o._id||o.id} style={{borderTop:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 12px'}}>{o.customerPhone}</td>
                    <td style={{padding:'10px 12px'}}>{o.orderCountry||'-'}</td>
                    <td style={{padding:'10px 12px'}}>{o.city||'-'}</td>
                    <td style={{padding:'10px 12px', maxWidth:320, overflow:'hidden', textOverflow:'ellipsis'}} title={o.details}>{o.details}</td>
                    <td style={{padding:'10px 12px'}}>{fmtDate(o.createdAt)}</td>
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
