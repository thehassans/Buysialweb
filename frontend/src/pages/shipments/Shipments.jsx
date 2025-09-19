import React, { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost } from '../../api'

export default function Shipments(){
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [agents, setAgents] = useState([])
  const [filters, setFilters] = useState({ status: 'pending', method: '' })

  useEffect(()=>{ load(); /* agents for delivery boy selection */ loadAgents() },[])

  async function load(){
    setLoading(true)
    try{
      const data = await apiGet('/api/orders')
      setRows(data.orders || [])
    }catch(err){ setMsg(err?.message || 'Failed to load orders') }
    finally{ setLoading(false) }
  }

  async function loadAgents(){
    try{
      const res = await apiGet('/api/users/agents?q=')
      setAgents(res.users || [])
    }catch{ setAgents([]) }
  }

  function onFieldChange(id, name, value){
    setRows(list => list.map(o => o._id === id ? { ...o, [name]: value } : o))
  }

  async function onShip(o){
    try{
      const payload = {
        shipmentMethod: o.shipmentMethod || 'none',
        courierName: o.courierName || '',
        trackingNumber: o.trackingNumber || '',
        deliveryBoy: o.deliveryBoy || '',
        shippingFee: Number(o.shippingFee || 0),
        codAmount: Number(o.codAmount || 0),
        collectedAmount: Number(o.collectedAmount || 0),
      }
      await apiPost(`/api/orders/${o._id}/ship`, payload)
      await load()
    }catch(err){ alert(err?.message || 'Failed to ship') }
  }

  async function onUpdate(o){
    try{
      const payload = {
        shipmentMethod: o.shipmentMethod || 'none',
        shipmentStatus: o.shipmentStatus || 'pending',
        courierName: o.courierName || '',
        trackingNumber: o.trackingNumber || '',
        deliveryBoy: o.deliveryBoy || '',
        shippingFee: Number(o.shippingFee || 0),
        codAmount: Number(o.codAmount || 0),
        collectedAmount: Number(o.collectedAmount || 0),
        deliveryNotes: o.deliveryNotes || '',
        returnReason: o.returnReason || '',
      }
      await apiPost(`/api/orders/${o._id}/shipment/update`, payload)
      await load()
    }catch(err){ alert(err?.message || 'Failed to update') }
  }

  async function onDeliver(o){
    try{
      await apiPost(`/api/orders/${o._id}/deliver`, { collectedAmount: Number(o.collectedAmount || 0) })
      await load()
    }catch(err){ alert(err?.message || 'Failed to mark delivered') }
  }

  async function onReturn(o){
    try{
      await apiPost(`/api/orders/${o._id}/return`, { reason: o.returnReason || '' })
      await load()
    }catch(err){ alert(err?.message || 'Failed to mark returned') }
  }

  async function onSettle(o){
    try{
      await apiPost(`/api/orders/${o._id}/settle`, { receivedFromCourier: Number(o.receivedFromCourier || 0) })
      await load()
    }catch(err){ alert(err?.message || 'Failed to settle') }
  }

  const filtered = useMemo(()=>{
    let out = rows
    if (filters.status){ out = out.filter(o => (o.status === filters.status) || (filters.status === 'pending' && o.status !== 'shipped')) }
    if (filters.method){ out = out.filter(o => (o.shipmentMethod || 'none') === filters.method) }
    return out
  }, [rows, filters])

  function fmtDate(s){ try{ return new Date(s).toLocaleString() }catch{ return ''} }

  return (
    <div>
      <div className="card" style={{marginBottom:12}}>
        <div style={{fontWeight:700, fontSize:18}}>Shipments</div>
        <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
          <select className="input" style={{maxWidth:220}} value={filters.status} onChange={e=>setFilters(f=>({...f, status:e.target.value}))}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="shipped">Shipped</option>
          </select>
          <select className="input" style={{maxWidth:220}} value={filters.method} onChange={e=>setFilters(f=>({...f, method:e.target.value}))}>
            <option value="">All Methods</option>
            <option value="none">None</option>
            <option value="delivery_boy">Delivery Boy</option>
            <option value="courier">Courier</option>
          </select>
          <button className="btn" onClick={load} disabled={loading}>{loading? 'Refreshing...' : 'Refresh'}</button>
        </div>
        {msg && <div style={{marginTop:8}}>{msg}</div>}
      </div>

      <div className="card">
        <div style={{fontWeight:600, marginBottom:8}}>Orders</div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0}}>
            <thead>
              <tr>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Order Country</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>City</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Phone</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Details</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Product</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Qty</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Method</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Ship. Status</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Delivery Boy</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Courier</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Tracking</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Fee</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>COD</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Collected</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Balance (calc)</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Notes</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Return Reason</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Settlement</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Status</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={16} style={{padding:'10px 12px', opacity:0.7}}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={16} style={{padding:'10px 12px', opacity:0.7}}>No orders</td></tr>
              ) : (
                filtered.map(o => {
                  const fee = Number(o.shippingFee||0)
                  const cod = Number(o.codAmount||0)
                  const col = Number(o.collectedAmount||0)
                  const bal = Math.max(0, cod - col - fee)
                  return (
                    <tr key={o._id} style={{borderTop:'1px solid var(--border)'}}>
                      <td style={{padding:'10px 12px'}}>{o.orderCountry || '-'}</td>
                      <td style={{padding:'10px 12px'}}>{o.city || '-'}</td>
                      <td style={{padding:'10px 12px'}}>{`${o.phoneCountryCode || ''} ${o.customerPhone}`.trim()}</td>
                      <td style={{padding:'10px 12px'}}>{o.details}</td>
                      <td style={{padding:'10px 12px'}}>{o.productId?.name || '-'}</td>
                      <td style={{padding:'10px 12px'}}>{o.quantity || 1}</td>
                      <td style={{padding:'10px 12px'}}>
                        <select className="input" value={o.shipmentMethod || 'none'} onChange={e=>onFieldChange(o._id, 'shipmentMethod', e.target.value)}>
                          <option value="none">None</option>
                          <option value="delivery_boy">Delivery Boy</option>
                          <option value="courier">Courier</option>
                        </select>
                      </td>
                      <td style={{padding:'10px 12px'}}>
                        <select className="input" value={o.shipmentStatus || 'pending'} onChange={e=>onFieldChange(o._id, 'shipmentStatus', e.target.value)}>
                          <option value="pending">Pending</option>
                          <option value="assigned">Assigned</option>
                          <option value="in_transit">In Transit</option>
                          <option value="delivered">Delivered</option>
                          <option value="returned">Returned</option>
                          <option value="canceled">Canceled</option>
                        </select>
                      </td>
                      <td style={{padding:'10px 12px'}}>
                        {o.shipmentMethod === 'delivery_boy' ? (
                          <select className="input" value={o.deliveryBoy || ''} onChange={e=>onFieldChange(o._id, 'deliveryBoy', e.target.value)}>
                            <option value="">-- Select Agent --</option>
                            {agents.map(a => (
                              <option key={a._id} value={a._id}>{`${a.firstName||''} ${a.lastName||''}`.trim() || a.email}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{opacity:0.9}}>{o.deliveryBoy?.firstName || o.deliveryBoy?.lastName ? `${o.deliveryBoy?.firstName||''} ${o.deliveryBoy?.lastName||''}`.trim() : '-'}</span>
                        )}
                      </td>
                      <td style={{padding:'10px 12px'}}>
                        {o.shipmentMethod === 'courier' ? (
                          <input className="input" value={o.courierName || ''} onChange={e=>onFieldChange(o._id, 'courierName', e.target.value)} placeholder="Aramex, SMSA, ..." />
                        ) : <span style={{opacity:0.7}}>-</span>}
                      </td>
                      <td style={{padding:'10px 12px'}}>
                        <input className="input" value={o.trackingNumber || ''} onChange={e=>onFieldChange(o._id, 'trackingNumber', e.target.value)} placeholder="#" />
                      </td>
                      <td style={{padding:'10px 12px'}}>
                        <input className="input" type="number" min="0" step="0.01" value={o.shippingFee || ''} onChange={e=>onFieldChange(o._id, 'shippingFee', e.target.value)} />
                      </td>
                      <td style={{padding:'10px 12px'}}>
                        <input className="input" type="number" min="0" step="0.01" value={o.codAmount || ''} onChange={e=>onFieldChange(o._id, 'codAmount', e.target.value)} />
                      </td>
                      <td style={{padding:'10px 12px'}}>
                        <input className="input" type="number" min="0" step="0.01" value={o.collectedAmount || ''} onChange={e=>onFieldChange(o._id, 'collectedAmount', e.target.value)} />
                      </td>
                      <td style={{padding:'10px 12px'}}>{bal.toFixed(2)}</td>
                      <td style={{padding:'10px 12px'}}>
                        <input className="input" value={o.deliveryNotes || ''} onChange={e=>onFieldChange(o._id, 'deliveryNotes', e.target.value)} placeholder="Notes" />
                      </td>
                      <td style={{padding:'10px 12px'}}>
                        <input className="input" value={o.returnReason || ''} onChange={e=>onFieldChange(o._id, 'returnReason', e.target.value)} placeholder="Reason" />
                      </td>
                      <td style={{padding:'10px 12px'}}>
                        {o.settled ? (
                          <div>
                            <div style={{opacity:0.9}}>Settled</div>
                            <div style={{opacity:0.8}}>Received: {Number(o.receivedFromCourier||0).toFixed(2)}</div>
                          </div>
                        ) : (
                          <div style={{display:'grid', gap:6}}>
                            <input className="input" type="number" min="0" step="0.01" value={o.receivedFromCourier || ''} onChange={e=>onFieldChange(o._id, 'receivedFromCourier', e.target.value)} placeholder="Received" />
                            <button className="btn small" onClick={()=>onSettle(o)}>Settle</button>
                          </div>
                        )}
                      </td>
                      <td style={{padding:'10px 12px'}}>{o.status}</td>
                      <td style={{padding:'10px 12px'}}>
                        <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                          {o.status !== 'shipped' && (
                            <button className="btn secondary" onClick={()=>onShip(o)}>Ship</button>
                          )}
                          <button className="btn" onClick={()=>onUpdate(o)}>Update</button>
                          <button className="btn success" onClick={()=>onDeliver(o)}>Deliver</button>
                          <button className="btn danger" onClick={()=>onReturn(o)}>Return</button>
                        </div>
                        {o.status === 'shipped' && (
                          <div style={{opacity:0.8, marginTop:6}}>Shipped {fmtDate(o.shippedAt)}</div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
