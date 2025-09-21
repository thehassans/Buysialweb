import React, { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { apiGet, apiPost, API_BASE } from '../../api'
import { io } from 'socket.io-client'

export default function SubmitOrder(){
  const location = useLocation()
  const [isMobile, setIsMobile] = useState(()=> (typeof window!=='undefined' ? window.innerWidth <= 768 : false))
  const COUNTRY_OPTS = [
    { key:'UAE', name:'UAE', code:'+971', flag:'🇦🇪' },
    { key:'OM', name:'Oman', code:'+968', flag:'🇴🇲' },
    { key:'KSA', name:'KSA', code:'+966', flag:'🇸🇦' },
    { key:'BH', name:'Bahrain', code:'+973', flag:'🇧🇭' },
  ]
  const DEFAULT_COUNTRY = COUNTRY_OPTS[2] // KSA
  const [form, setForm] = useState({ customerName:'', customerPhone:'', phoneCountryCode: DEFAULT_COUNTRY.code, orderCountry: DEFAULT_COUNTRY.name, city:'', customerAddress:'', locationLat:'', locationLng:'', customerLocation:'', details:'', productId:'', quantity: 1, total: '', discount:'', shipping:'', invoiceNumber: '' })
  const [customerInfo, setCustomerInfo] = useState({ name:'', fullPhone:'' })
  const [coordsInput, setCoordsInput] = useState('')
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [rows, setRows] = useState([])
  const [statusFilter, setStatusFilter] = useState('all') // all|pending|shipped|delivered|returned
  const [loadingList, setLoadingList] = useState(false)
  const [products, setProducts] = useState([])

  const COUNTRY_CITIES = useMemo(()=>({
    UAE: ['Abu Dhabi','Dubai','Sharjah','Ajman','Umm Al Quwain','Ras Al Khaimah','Fujairah','Al Ain','Madinat Zayed','Ruways','Liwa','Kalba','Khor Fakkan','Dibba Al-Fujairah','Dibba Al-Hisn'],
    OM: ['Muscat','Muttrah','Bawshar','Aseeb','Seeb','Qurayyat','Nizwa','Sohar','Sur','Ibri','Rustaq','Buraimi','Salalah','Khasab','Ibra','Sinaw','Jalan Bani Bu Ali','Jalan Bani Bu Hasan'],
    KSA: ['Riyadh','Jeddah','Makkah','Madinah','Dammam','Khobar','Dhahran','Taif','Tabuk','Abha','Khamis Mushait','Jizan','Najran','Hail','Buraydah','Unaizah','Qatif','Al Ahsa','Jubail','Yanbu','Al Bahah','Arar','Sakaka','Hafar Al Batin','Al Majmaah','Al Kharj','Al Qurayyat','Rafha'],
    BH: ['Manama','Riffa','Muharraq','Hamad Town','Aali','Isa Town','Sitra','Budaiya','Jidhafs','Sanad','Tubli','Zallaq'],
  }),[])
  const currentCountryKey = useMemo(()=>{
    const byName = COUNTRY_OPTS.find(c=>c.name===form.orderCountry)
    if (byName) return byName.key
    // fallback from code
    const byCode = COUNTRY_OPTS.find(c=>c.code===form.phoneCountryCode)
    return byCode?.key || 'KSA'
  },[form.orderCountry, form.phoneCountryCode])
  const cities = COUNTRY_CITIES[currentCountryKey] || []

  useEffect(()=>{
    function onResize(){ setIsMobile(window.innerWidth <= 768) }
    window.addEventListener('resize', onResize)
    return ()=> window.removeEventListener('resize', onResize)
  },[])

  function onChange(e){
    const { name, value } = e.target
    if (name === 'phoneCountryCode'){
      const opt = COUNTRY_OPTS.find(o=>o.code===value)
      // Reset total so suggestion recalculates in the new currency; also reset city tied to country
      setForm(f => ({ ...f, [name]: value, orderCountry: opt?.name || f.orderCountry, city: '', total: '' }))
      return
    }
    setForm(f => ({ ...f, [name]: value }))
  }

  // Keep combined coordinates input in sync when form coordinates change elsewhere
  useEffect(()=>{
    if (form.locationLat && form.locationLng){
      setCoordsInput(`${form.locationLat}, ${form.locationLng}`)
    } else {
      setCoordsInput('')
    }
  }, [form.locationLat, form.locationLng])

  function parseAndSetCoords(raw){
    const s = String(raw||'').trim()
    setCoordsInput(s)
    const parts = s.split(',')
    if (parts.length >= 2){
      const lat = parseFloat(parts[0])
      const lng = parseFloat(parts[1])
      if (!Number.isNaN(lat) && !Number.isNaN(lng)){
        setForm(f => ({ ...f, locationLat: lat, locationLng: lng }))
        return
      }
    }
    // If not valid, do not overwrite existing numeric values; user may still be typing
  }

  // Prefill from query params (?jid=...&name=...)
  useEffect(()=>{
    try{
      const params = new URLSearchParams(location.search || '')
      const jid = (params.get('jid')||'').trim()
      const name = (params.get('name')||'').trim()
      if (!jid) return
      // Extract digits (MSISDN) before @
      const msisdn = jid.replace(/@.*/, '')
      const digits = msisdn.replace(/\D/g, '')
      // Country inference by prefix
      const ccList = [
        { cc:'971', opt: COUNTRY_OPTS.find(o=>o.key==='UAE') },
        { cc:'968', opt: COUNTRY_OPTS.find(o=>o.key==='OM') },
        { cc:'966', opt: COUNTRY_OPTS.find(o=>o.key==='KSA') },
        { cc:'973', opt: COUNTRY_OPTS.find(o=>o.key==='BH') },
      ]
      const matched = ccList.find(x => digits.startsWith(x.cc))
      const country = matched?.opt || DEFAULT_COUNTRY
      const local = matched ? digits.slice(matched.cc.length) : digits
      setForm(f => ({
        ...f,
        phoneCountryCode: country.code,
        orderCountry: country.name,
        city: '',
        customerPhone: local,
      }))
      setCustomerInfo({ name, fullPhone: `${country.code} ${local}`.trim() })
    }catch{}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search])

  // Load current user for agent banner
  useEffect(()=>{
    (async ()=>{
      try{ const { user } = await apiGet('/api/users/me'); setMe(user) }catch(_){ setMe(null) }
    })()
  },[])

  const canCreateOrder = !!(me && (me.role !== 'manager' || (me.managerPermissions && me.managerPermissions.canCreateOrders)))

  async function load(){
    setLoadingList(true)
    try{
      const data = await apiGet('/api/orders')
      setRows(data.orders||[])
    }catch(_){}
    finally{ setLoadingList(false) }
  }

  async function loadProducts(){
    try{
      const data = await apiGet('/api/products')
      setProducts(data.products||[])
    }catch(_){}
  }

  useEffect(()=>{ load(); loadProducts() },[])

  // Live refresh on workspace order changes
  useEffect(()=>{
    let socket
    try{
      const token = localStorage.getItem('token') || ''
      socket = io(API_BASE || undefined, { path:'/socket.io', transports:['websocket','polling'], auth: { token } })
      const refresh = ()=>{ load() }
      socket.on('orders.changed', refresh)
    }catch{}
    return ()=>{
      try{ socket && socket.off('orders.changed') }catch{}
      try{ socket && socket.disconnect() }catch{}
    }
  },[])

  // Generate a mostly-unique invoice number (server should enforce uniqueness)
  function genInvoice(){
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth()+1).padStart(2,'0')
    const day = String(d.getDate()).padStart(2,'0')
    const rand = Math.random().toString(36).slice(2,6).toUpperCase()
    return `INV-${y}${m}${day}-${rand}`
  }
  // Initialize invoice number once
  useEffect(()=>{
    setForm(f => ({ ...f, invoiceNumber: f.invoiceNumber || genInvoice() }))
  },[])

  // Computed pricing when a product is selected
  const selectedProduct = useMemo(()=> products.find(p => p._id === form.productId) || null, [products, form.productId])
  // Currency conversion (mirror logic from InhouseProducts page)
  const RATES = {
    // Approx cross rates relative to SAR (same table as InhouseProducts)
    SAR: { SAR: 1, AED: 0.98, OMR: 0.10, BHD: 0.10 },
    AED: { SAR: 1.02, AED: 1, OMR: 0.10, BHD: 0.10 },
    OMR: { SAR: 9.78, AED: 9.58, OMR: 1, BHD: 0.98 },
    BHD: { SAR: 9.94, AED: 9.74, OMR: 1.02, BHD: 1 },
  }
  function convertPrice(value, from, to){
    const v = Number(value||0)
    if (!from || !to) return v
    const r = RATES[from]?.[to]
    return r ? v * r : v
  }
  const PHONE_CODE_TO_CCY = { '+966':'SAR', '+971':'AED', '+968':'OMR', '+973':'BHD' }
  const PHONE_CODE_TO_COUNTRYKEY = { '+966':'KSA', '+971':'UAE', '+968':'OM', '+973':'BH' }
  const selectedCurrency = PHONE_CODE_TO_CCY[form.phoneCountryCode] || 'SAR'
  const unitPrice = useMemo(()=>{
    if (!selectedProduct) return 0
    const base = selectedProduct.baseCurrency || 'SAR'
    return convertPrice(Number(selectedProduct.price)||0, base, selectedCurrency)
  }, [selectedProduct, selectedCurrency])
  const quantityNum = useMemo(()=> Number(form.quantity) > 0 ? Number(form.quantity) : 1, [form.quantity])
  const totalPrice = useMemo(()=> unitPrice * quantityNum, [unitPrice, quantityNum])

  // Country-specific stock left for the selected product
  const stockLeft = useMemo(()=>{
    if (!selectedProduct) return null
    const by = selectedProduct.stockByCountry || { UAE:0, Oman:0, KSA:0, Bahrain:0 }
    const cKey = PHONE_CODE_TO_COUNTRYKEY[form.phoneCountryCode] || 'KSA'
    if (cKey === 'UAE') return by.UAE ?? 0
    if (cKey === 'OM') return by.Oman ?? 0
    if (cKey === 'KSA') return by.KSA ?? 0
    if (cKey === 'BH') return by.Bahrain ?? 0
    return 0
  }, [selectedProduct, form.phoneCountryCode])

  // Suggest total = unitPrice * qty only when user hasn't entered a value yet
  useEffect(()=>{
    if (selectedProduct && (form.total === '' || form.total == null)){
      setForm(f => ({ ...f, total: (unitPrice * quantityNum).toFixed(2) }))
    }
  }, [selectedProduct, unitPrice, quantityNum])

  async function onSubmit(e){
    e.preventDefault()
    setMsg('')
    setLoading(true)
    try{
      // Ensure we send a readable customerLocation even if using geolocation
      const locString = (form.locationLat && form.locationLng)
        ? `(${Number(form.locationLat).toFixed(6)}, ${Number(form.locationLng).toFixed(6)})`
        : (form.customerLocation || form.customerAddress || form.city || form.orderCountry)
      await apiPost('/api/orders', { ...form, customerLocation: locString, quantity: Number(form.quantity||1) })
      setMsg('Order submitted')
      setForm({ customerName:'', customerPhone:'', phoneCountryCode: DEFAULT_COUNTRY.code, orderCountry: DEFAULT_COUNTRY.name, city:'', customerAddress:'', locationLat:'', locationLng:'', customerLocation:'', details:'', productId:'', quantity: 1, total: '', discount:'', shipping:'', invoiceNumber: genInvoice() })
      load()
    }catch(err){
      setMsg(err?.message || 'Failed to submit order')
    }finally{
      setLoading(false)
    }
  }

  function fmtDate(s){ try{ return new Date(s).toLocaleString() }catch{ return ''} }
  function timeAgo(s){
    try{
      const d = new Date(s).getTime(); const now = Date.now(); const diff = Math.max(0, Math.floor((now-d)/1000))
      const mins = Math.floor(diff/60), hrs = Math.floor(mins/60), days = Math.floor(hrs/24)
      if (diff < 60) return `${diff}s ago`
      if (mins < 60) return `${mins}m ago`
      if (hrs < 24) return `${hrs}h ago`
      return `${days}d ago`
    }catch{ return '' }
  }
  function statusBadge(st){
    const v = String(st||'pending').toLowerCase()
    const map = {
      pending: {bg:'#1f2937', bd:'#334155', fg:'#e5e7eb', label:'pending'},
      shipped: {bg:'#0f3f33', bd:'#065f46', fg:'#c7f9ec', label:'shipped'},
      delivered: {bg:'#102a43', bd:'#1f4a6e', fg:'#bee3f8', label:'delivered'},
      returned: {bg:'#3b0d0d', bd:'#7f1d1d', fg:'#fecaca', label:'returned'},
      cancelled: {bg:'#3f1d1d', bd:'#7f1d1d', fg:'#fecaca', label:'cancelled'},
    }
    const c = map[v] || map.pending
    return <span className="badge" style={{background:c.bg, border:`1px solid ${c.bd}`, color:c.fg}}>{c.label}</span>
  }

  function derivedStatus(o){
    const ship = String(o?.shipmentStatus||'').toLowerCase()
    if (['delivered','returned','cancelled'].includes(ship)) return ship
    const st = String(o?.status||'pending').toLowerCase()
    return st
  }

  const filteredRows = rows.filter(o => {
    if (statusFilter === 'all') return true
    return derivedStatus(o) === statusFilter
  })

  function useCurrentLocation(){
    if (!navigator.geolocation){
      alert('Geolocation is not supported by this browser')
      return
    }
    navigator.geolocation.getCurrentPosition(async (pos)=>{
      const { latitude, longitude } = pos.coords || {}
      setForm(f=> ({ ...f, locationLat: latitude, locationLng: longitude, customerLocation: `(${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)})` }))
      // Try reverse geocoding to resolve address
      try { await resolveFromCoords(latitude, longitude) } catch(_){ }
    }, (err)=>{
      alert('Failed to get location: ' + (err?.message||'Unknown error'))
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
  }

  async function resolveFromCoords(lat, lng){
    if (!lat || !lng) return
    try{
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
      if (!res.ok) throw new Error('Failed to resolve address')
      const data = await res.json()
      const display = data?.display_name || ''
      const addr = data?.address || {}
      const cityGuess = addr.city || addr.town || addr.village || addr.suburb || ''
      setForm(f=> ({ ...f, customerAddress: display || f.customerAddress, city: f.city || cityGuess }))
    }catch(err){ /* ignore errors, keep manual entry */ }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title gradient heading-purple">Submit Order</div>
          <div className="page-subtitle">Create a new order for a customer</div>
        </div>
      </div>

      <div className="card" style={{display:'grid', gap:12}}>
        {(customerInfo.name || customerInfo.fullPhone) && (
          <div style={{display:'flex', gap:12, alignItems:'center', padding:'8px 10px', background:'var(--panel-2)', border:'1px solid var(--border)', borderRadius:8}}>
            <div style={{fontWeight:600}}>Customer:</div>
            {customerInfo.name && <div>{customerInfo.name}</div>}
            {customerInfo.fullPhone && <div style={{opacity:0.85}}>{customerInfo.fullPhone}</div>}
          </div>
        )}
        {String(location.pathname||'').startsWith('/agent') && me && (
          <div style={{display:'flex', gap:12, alignItems:'center', padding:'8px 10px', background:'var(--panel-2)', border:'1px solid var(--border)', borderRadius:8}}>
            <div style={{fontWeight:600}}>Agent:</div>
            <div>{me.firstName} {me.lastName}</div>
          </div>
        )}
        {!canCreateOrder && (
          <div className="helper" style={{padding:'8px 10px', background:'var(--panel-2)', border:'1px solid var(--border)', borderRadius:8}}>
            Your manager account does not have permission to create orders. Please contact the owner to enable "Can create orders".
          </div>
        )}
        <form onSubmit={onSubmit} style={{display:'grid'}}>
          <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap:16, alignItems:'start'}}>
            {/* Left column: form fields */}
            <div style={{display:'grid', gap:12, opacity: canCreateOrder ? 1 : 0.6, pointerEvents: canCreateOrder ? 'auto' : 'none'}}>
              <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap:12}}>
                <div>
                  <div className="label">Phone Country Code</div>
                  <select className="input" name="phoneCountryCode" value={form.phoneCountryCode} onChange={onChange} required>
                    {COUNTRY_OPTS.map(opt => (
                      <option key={opt.key} value={opt.code}>{`${opt.flag} ${opt.name} (${opt.code})`}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="label">City</div>
                  <select className="input" name="city" value={form.city} onChange={onChange} required>
                    <option value="">-- Select City --</option>
                    {cities.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <div style={{fontSize:12, opacity:0.8, marginTop:4}}>Country: {form.orderCountry}</div>
                </div>
              </div>

              <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap:12}}>
                <div>
                  <div className="label">Select Product (optional)</div>
                  <select className="input" name="productId" value={form.productId} onChange={onChange}>
                    <option value="">-- No Product --</option>
                    {products.map(p => {
                      const base = p.baseCurrency || 'SAR'
                      const display = convertPrice(Number(p.price)||0, base, selectedCurrency)
                      return (
                        <option key={p._id} value={p._id}>{`${p.name} • ${selectedCurrency} ${display.toFixed(2)}`}</option>
                      )
                    })}
                  </select>
                </div>
                <div>
                  <div className="label">Quantity</div>
                  <input className="input" type="number" min="1" name="quantity" value={form.quantity} onChange={onChange} />
                  {selectedProduct && (
                    <div className="helper" style={{marginTop:4}}>
                      Stock left for {form.orderCountry || (PHONE_CODE_TO_COUNTRYKEY[form.phoneCountryCode]||'country')}: <strong>{stockLeft != null ? stockLeft : '-'}</strong>
                      {Number(form.quantity||1) > (stockLeft||0) && (
                        <span style={{color:'#fca5a5', marginLeft:6}}>(exceeds available stock)</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="label">Customer Name</div>
                <input className="input" name="customerName" value={form.customerName} onChange={onChange} placeholder="Full name" />
              </div>
              
              <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:12}}>
                <div>
                  <div className="label">Location</div>
                  <div className="input" style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                    <span style={{opacity:0.85}}>{form.locationLat && form.locationLng ? `(${Number(form.locationLat).toFixed(6)}, ${Number(form.locationLng).toFixed(6)})` : (form.customerLocation || 'No location selected')}</span>
                    <div style={{display:'flex', gap:6}}>
                      {(form.locationLat && form.locationLng) && (
                        <button type="button" className="btn secondary" onClick={()=> navigator.clipboard && navigator.clipboard.writeText(`${Number(form.locationLat).toFixed(6)}, ${Number(form.locationLng).toFixed(6)}`)}>Copy</button>
                      )}
                    </div>
                  </div>
                  {form.locationLat && form.locationLng && (
                    <a className="btn secondary" href={`https://www.google.com/maps?q=${form.locationLat},${form.locationLng}`} target="_blank" rel="noreferrer" style={{marginTop:6, display:'inline-block'}}>Open in Maps</a>
                  )}
                </div>
                <div>
                  <div className="label">Manual Location (optional)</div>
                  <input className="input" name="customerLocation" value={form.customerLocation} onChange={onChange} placeholder="City, Area or coordinates" />
                  <div className="label" style={{marginTop:8}}>Coordinates (Lat, Lng)</div>
                  <div style={{ position:'relative', marginTop:4 }}>
                    <input
                      className="input"
                      name="coords"
                      value={coordsInput}
                      onChange={(e)=> parseAndSetCoords(e.target.value)}
                      onBlur={(e)=> parseAndSetCoords(e.target.value)}
                      placeholder="24.7136, 46.6753"
                      style={{
                        minWidth: isMobile ? '100%' : 240,
                        paddingRight: 140, // space for the inline button
                      }}
                    />
                    <button
                      type="button"
                      className="btn small secondary"
                      onClick={()=> resolveFromCoords(form.locationLat, form.locationLng)}
                      aria-label="Resolve address from coordinates"
                      title="Resolve Address"
                      style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', whiteSpace:'nowrap' }}
                    >
                      Resolve Address
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div className="label">Customer Phone Number</div>
                <div style={{display:'grid', gridTemplateColumns:'auto 1fr', gap:6, alignItems:'center'}}>
                  <div className="input" style={{padding:'0 10px', display:'flex', alignItems:'center'}}>{form.phoneCountryCode || ''}</div>
                  <input className="input" name="customerPhone" value={form.customerPhone} onChange={onChange} placeholder="e.g. 5xxxxxxx" required autoComplete="tel" />
                </div>
              </div>
              <div>
                <div className="label">Customer Address</div>
                <input className="input" name="customerAddress" value={form.customerAddress} onChange={onChange} placeholder="Street, Building, Area" />
              </div>

              <div>
                <div className="label">Order Details</div>
                <textarea className="input" name="details" value={form.details} onChange={onChange} placeholder="Describe items, quantities, notes..." rows={4} required />
              </div>
            </div>

            {/* Right column: sticky summary */}
            <div style={{position: isMobile ? 'static' : 'sticky', top:12, display:'grid', gap:12}}>
              <div className="card" style={{display:'grid', gap:12}}>
                <div style={{display:'flex', gap:12, alignItems:'center'}}>
                  {selectedProduct && ((selectedProduct.images && selectedProduct.images[0]) || selectedProduct.imagePath) ? (
                    <img src={`${API_BASE}${(selectedProduct.images && selectedProduct.images[0]) || selectedProduct.imagePath}`} alt={selectedProduct.name} style={{width:56,height:56,objectFit:'cover',borderRadius:8,border:'1px solid var(--border)'}} />
                  ) : (
                    <div style={{width:56,height:56,borderRadius:8,border:'1px dashed var(--border)',display:'grid',placeItems:'center',color:'var(--muted)'}}>No Img</div>
                  )}
                  <div>
                    <div className="label">Product</div>
                    <div style={{fontWeight:700}}>{selectedProduct ? selectedProduct.name : '— Select Product —'}</div>
                  </div>
                </div>

                <div className="summary">
                  <div className="row" style={{gap:8}}>
                    <span className="muted">Invoice #</span>
                    <div style={{display:'flex', gap:6, alignItems:'center'}}>
                      <input className="input" value={form.invoiceNumber} readOnly style={{maxWidth:180}} />
                      <button type="button" className="btn secondary" onClick={()=> navigator.clipboard && navigator.clipboard.writeText(form.invoiceNumber)}>Copy</button>
                    </div>
                  </div>
                </div>

                <div className="summary">
                  <div className="row"><span className="muted">Unit Price ({selectedCurrency})</span><span>{selectedProduct ? unitPrice.toFixed(2) : '-'}</span></div>
                  <div className="row"><span className="muted">Qty</span><span>{quantityNum}</span></div>
                  <div className="row"><span className="muted">Suggested</span><span>{selectedProduct ? totalPrice.toFixed(2) : '-'}</span></div>
                  <div className="row" style={{gap:8}}>
                    <span className="muted">Shipping ({selectedCurrency})</span>
                    <input className="input" name="shipping" value={form.shipping} onChange={onChange} placeholder="0.00" style={{maxWidth:140}} />
                  </div>
                  <div className="row" style={{gap:8}}>
                    <span className="muted">Discount ({selectedCurrency})</span>
                    <input className="input" name="discount" value={form.discount} onChange={onChange} placeholder="0.00" style={{maxWidth:140}} />
                  </div>
                  <div style={{display:'grid', gap:6}}>
                    <span className="muted">Total ({selectedCurrency})</span>
                    <input
                      className="input"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      name="total"
                      value={form.total}
                      onChange={onChange}
                      placeholder={selectedProduct ? totalPrice.toFixed(2) : '0.00'}
                    />
                  </div>
                </div>
              </div>
              <button className="btn" type="submit" disabled={loading || !canCreateOrder}>{loading? (<span><span className="spinner"/> Submitting…</span>) : 'Submit Order'}</button>
              {msg && <div style={{opacity:0.9}}>{msg}</div>}
            </div>
          </div>
        </form>
      </div>

      <div className="card" style={{marginTop:12}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div style={{fontWeight:700}}>Recent Orders</div>
        </div>
        {/* Quick filters */}
        <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginTop:8}}>
          {[
            {k:'all', label:'All'},
            {k:'pending', label:'Pending'},
            {k:'shipped', label:'Shipped'},
            {k:'delivered', label:'Delivered'},
            {k:'returned', label:'Returned'},
            {k:'cancelled', label:'Cancelled'},
          ].map(it => (
            <button key={it.k} type="button" onClick={()=> setStatusFilter(it.k)}
              className="btn secondary"
              style={{
                padding:'6px 10px',
                background: statusFilter===it.k? 'rgba(0,168,132,0.12)' : 'var(--panel)',
                border: `1px solid ${statusFilter===it.k? 'rgba(0,168,132,0.35)':'var(--border)'}`,
                color: statusFilter===it.k? 'var(--fg)' : 'inherit'
              }}
            >{it.label}</button>
          ))}
        </div>

        <div style={{overflow:'auto', marginTop:8}}>
          <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0}}>
            <thead>
              <tr style={{position:'sticky', top:0, zIndex:1}}>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Order Country</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>City</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Phone</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Address</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Location</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Details</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Product</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Qty</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Created by</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Status</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Created</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr><td colSpan={12} style={{padding:'12px', opacity:0.7}}>Loading...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{padding:'16px'}}>
                    <div style={{display:'flex', alignItems:'center', gap:10, opacity:0.8}}>
                      <span>🧾</span>
                      <div>No orders to show for this filter.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((o, idx) => (
                  <tr key={o._id} style={{borderTop:'1px solid var(--border)', background: idx%2===0? 'transparent':'var(--panel-2)'}}>
                    <td style={{padding:'10px 12px'}}>{o.orderCountry || '-'}</td>
                    <td style={{padding:'10px 12px'}}>{o.city || '-'}</td>
                    <td style={{padding:'10px 12px', whiteSpace:'nowrap'}} title={`${o.phoneCountryCode||''} ${o.customerPhone}`.trim()}>{`${o.phoneCountryCode || ''} ${o.customerPhone}`.trim()}</td>
                    <td style={{padding:'10px 12px', maxWidth:240, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={o.customerAddress||''}>{o.customerAddress || '-'}</td>
                    <td style={{padding:'10px 12px'}}>{o.locationLat && o.locationLng ? `(${Number(o.locationLat).toFixed(4)}, ${Number(o.locationLng).toFixed(4)})` : (o.customerLocation || '-')}</td>
                    <td style={{padding:'10px 12px', maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={o.details}>{o.details}</td>
                    <td style={{padding:'10px 12px'}}>{o.productId?.name || '-'}</td>
                    <td style={{padding:'10px 12px', textAlign:'right'}}>{o.quantity || 1}</td>
                    <td style={{padding:'10px 12px'}}>
                      {o.createdBy ? (
                        <span title={o.createdBy.email||''}>
                          {(o.createdBy.firstName||'') + ' ' + (o.createdBy.lastName||'')} {o.createdBy.role ? (<span className="badge" style={{marginLeft:6}}>{o.createdBy.role}</span>) : null}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{padding:'10px 12px'}}>{statusBadge(derivedStatus(o))}</td>
                    <td style={{padding:'10px 12px', whiteSpace:'nowrap'}} title={fmtDate(o.createdAt)}>{timeAgo(o.createdAt)}</td>
                    <td style={{padding:'10px 12px'}}>
                      {o.status !== 'shipped' && (
                        <button className="btn secondary" onClick={async ()=>{ try{ await apiPost(`/api/orders/${o._id}/ship`, {}); load() }catch(err){ alert(err?.message||'Failed') } }}>Ship</button>
                      )}
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
