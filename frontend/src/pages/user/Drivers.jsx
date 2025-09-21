import React, { useEffect, useMemo, useState } from 'react'
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input'
import { API_BASE, apiGet, apiPost, apiDelete } from '../../api'
import { io } from 'socket.io-client'
import Modal from '../../components/Modal.jsx'

export default function Drivers(){
  // Country/city options mirrored from SubmitOrder
  const COUNTRY_OPTS = [
    { key:'UAE', name:'UAE', code:'+971', flag:'🇦🇪' },
    { key:'OM', name:'Oman', code:'+968', flag:'🇴🇲' },
    { key:'KSA', name:'KSA', code:'+966', flag:'🇸🇦' },
    { key:'BH', name:'Bahrain', code:'+973', flag:'🇧🇭' },
  ]
  const COUNTRY_CITIES = useMemo(()=>({
    UAE: ['Abu Dhabi','Dubai','Sharjah','Ajman','Umm Al Quwain','Ras Al Khaimah','Fujairah','Al Ain','Madinat Zayed','Ruways','Liwa','Kalba','Khor Fakkan','Dibba Al-Fujairah','Dibba Al-Hisn'],
    OM: ['Muscat','Muttrah','Bawshar','Aseeb','Seeb','Qurayyat','Nizwa','Sohar','Sur','Ibri','Rustaq','Buraimi','Salalah','Khasab','Ibra','Sinaw','Jalan Bani Bu Ali','Jalan Bani Bu Hasan'],
    KSA: ['Riyadh','Jeddah','Makkah','Madinah','Dammam','Khobar','Dhahran','Taif','Tabuk','Abha','Khamis Mushait','Jizan','Najran','Hail','Buraydah','Unaizah','Qatif','Al Ahsa','Jubail','Yanbu','Al Bahah','Arar','Sakaka','Hafar Al Batin','Al Majmaah','Al Kharj','Al Qurayyat','Rafha'],
    BH: ['Manama','Riffa','Muharraq','Hamad Town','Aali','Isa Town','Sitra','Budaiya','Jidhafs','Sanad','Tubli','Zallaq'],
  }),[])

  const DEFAULT_COUNTRY = COUNTRY_OPTS[2] // KSA
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', password:'', phone:'', country: DEFAULT_COUNTRY.name, city:'' })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [delModal, setDelModal] = useState({ open:false, busy:false, error:'', confirm:'', driver:null })

  const currentCountryKey = useMemo(()=>{
    const byName = COUNTRY_OPTS.find(c=>c.name===form.country)
    return byName?.key || DEFAULT_COUNTRY.key
  },[form.country])
  const cities = COUNTRY_CITIES[currentCountryKey] || []

  function onChange(e){
    const { name, value } = e.target
    if (name === 'country'){
      setForm(f => ({ ...f, country: value, city: '' }))
      return
    }
    setForm(f => ({ ...f, [name]: value }))
  }

  async function loadDrivers(query=''){
    setLoadingList(true)
    try{
      const data = await apiGet(`/api/users/drivers?q=${encodeURIComponent(query)}`)
      setRows((data.users||[]).map(u => ({
        id: u._id || u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phone: u.phone,
        country: u.country,
        city: u.city,
        createdAt: u.createdAt,
      })))
    }catch(_e){ setRows([]) }
    finally{ setLoadingList(false) }
  }

  useEffect(()=>{ loadDrivers('') },[])

  useEffect(()=>{
    const id = setTimeout(()=> loadDrivers(q), 300)
    return ()=> clearTimeout(id)
  },[q])

  // Real-time: refresh drivers list when a driver is created/deleted in this workspace
  useEffect(()=>{
    let socket
    try{
      const token = localStorage.getItem('token') || ''
      socket = io(API_BASE || undefined, { path:'/socket.io', transports:['polling','websocket'], auth: { token }, withCredentials: true })
      const refresh = ()=>{ loadDrivers(q) }
      socket.on('driver.created', refresh)
      socket.on('driver.deleted', refresh)
    }catch{}
    return ()=>{
      try{ socket && socket.off('driver.created') }catch{}
      try{ socket && socket.off('driver.deleted') }catch{}
      try{ socket && socket.disconnect() }catch{}
    }
  },[q])

  async function onSubmit(e){
    e.preventDefault()
    setMsg('')
    setLoading(true)
    try{
      if (form.phone && !isValidPhoneNumber(form.phone)){
        setLoading(false)
        setPhoneError('Enter a valid phone number with country code')
        setMsg('')
        return
      }
      const payload = { ...form }
      await apiPost('/api/users/drivers', payload)
      setMsg('Driver created successfully')
      setForm({ firstName:'', lastName:'', email:'', password:'', phone:'', country: DEFAULT_COUNTRY.name, city:'' })
      setPhoneError('')
      loadDrivers(q)
    }catch(err){ setMsg(err?.message || 'Failed to create driver') }
    finally{ setLoading(false) }
  }

  function openDelete(driver){ setDelModal({ open:true, busy:false, error:'', confirm:'', driver }) }
  function closeDelete(){ setDelModal(m=>({ ...m, open:false })) }
  async function confirmDelete(){
    const driver = delModal.driver
    if (!driver) return
    const want = (driver.email||'').trim().toLowerCase()
    const typed = (delModal.confirm||'').trim().toLowerCase()
    if (!typed || typed !== want){ setDelModal(m=>({ ...m, error: 'Please type the driver\'s email to confirm.' })); return }
    setDelModal(m=>({ ...m, busy:true, error:'' }))
    try{
      await apiDelete(`/api/users/drivers/${driver.id}`)
      setDelModal({ open:false, busy:false, error:'', confirm:'', driver:null })
      loadDrivers(q)
    }catch(e){ setDelModal(m=>({ ...m, busy:false, error: e?.message || 'Failed to delete driver' })) }
  }

  function fmtDate(s){ try{ return new Date(s).toLocaleString() }catch{ return ''} }

  return (
    <div className="section">
      {/* Page header */}
      <div className="page-header">
        <div>
          <div className="page-title gradient heading-blue">Drivers</div>
          <div className="page-subtitle">Create and manage delivery drivers. Drivers can log in and view orders for their country/city.</div>
        </div>
      </div>

      {/* Create Driver */}
      <div className="card">
        <div className="card-header">
          <div className="card-title modern">Create Driver</div>
          <div className="card-subtitle">Enter driver details including country and city for assignment</div>
        </div>
        <form onSubmit={onSubmit} className="section" style={{display:'grid', gap:12}}>
          <div className="form-grid">
            <div>
              <div className="label">First Name</div>
              <input className="input" name="firstName" value={form.firstName} onChange={onChange} placeholder="John" required autoComplete="given-name" />
            </div>
            <div>
              <div className="label">Last Name</div>
              <input className="input" name="lastName" value={form.lastName} onChange={onChange} placeholder="Doe" required autoComplete="family-name" />
            </div>
            <div>
              <div className="label">Email</div>
              <input className="input" type="email" name="email" value={form.email} onChange={onChange} placeholder="driver@example.com" required autoComplete="email" />
            </div>
          </div>
          <div className="form-grid">
            <div>
              <div className="label">Phone</div>
              <div className={`PhoneInput ${phoneError? 'input-error':''}`}>
                <PhoneInput
                  defaultCountry="AE"
                  placeholder="Enter phone number"
                  value={form.phone}
                  onChange={(value)=> { setForm(f=>({ ...f, phone: value||'' })); setPhoneError('') }}
                  international
                  withCountryCallingCode
                />
              </div>
              <div className={`helper-text ${phoneError? 'error':''}`}>{phoneError || 'Include country code, e.g. +971 50 123 4567'}</div>
            </div>
            <div>
              <div className="label">Country</div>
              <select className="input" name="country" value={form.country} onChange={onChange}>
                {COUNTRY_OPTS.map(opt => (
                  <option key={opt.key} value={opt.name}>{`${opt.flag} ${opt.name}`}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="label">City</div>
              <select className="input" name="city" value={form.city} onChange={onChange}>
                <option value="">-- Select City --</option>
                {cities.map(c => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
          </div>
          <div>
            <div className="label">Password</div>
            <input className="input" type="password" name="password" value={form.password} onChange={onChange} placeholder="Minimum 6 characters" required autoComplete="new-password" />
          </div>
          <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
            <button className="btn" type="submit" disabled={loading}>{loading? 'Creating...' : 'Create Driver'}</button>
          </div>
          {msg && <div style={{opacity:0.9}}>{msg}</div>}
        </form>
      </div>

      {/* Drivers List */}
      <div className="card" style={{marginTop:12, display:'grid', gap:12}}>
        <div className="card-header">
          <div className="card-title">Your Drivers</div>
          <input className="input" placeholder="Search by name, email, phone, country, city" value={q} onChange={e=>setQ(e.target.value)} style={{maxWidth:320}}/>
        </div>
        <div style={{overflow:'auto'}}>
          <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0}}>
            <thead>
              <tr>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Name</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Email</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Phone</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Country</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>City</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Created</th>
                <th style={{textAlign:'right', padding:'10px 12px'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr><td colSpan={7} style={{padding:12, opacity:0.7}}>Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} style={{padding:12, opacity:0.7}}>No drivers found</td></tr>
              ) : (
                rows.map(u=> (
                  <tr key={u.id} style={{borderTop:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 12px'}}>{u.firstName} {u.lastName}</td>
                    <td style={{padding:'10px 12px'}}>{u.email}</td>
                    <td style={{padding:'10px 12px'}}>{u.phone||'-'}</td>
                    <td style={{padding:'10px 12px'}}>{u.country||'-'}</td>
                    <td style={{padding:'10px 12px'}}>{u.city||'-'}</td>
                    <td style={{padding:'10px 12px'}}>{fmtDate(u.createdAt)}</td>
                    <td style={{padding:'10px 12px', textAlign:'right'}}>
                      <button className="btn danger" onClick={()=>openDelete(u)}>Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div style={{fontSize:12, opacity:0.8}}>
          Drivers can sign in at <code>/login</code>. They will be redirected to <code>/driver</code>.
        </div>
      </div>
      <Modal
        title="Are you sure you want to delete this driver?"
        open={delModal.open}
        onClose={closeDelete}
        footer={
          <>
            <button className="btn secondary" type="button" onClick={closeDelete} disabled={delModal.busy}>Cancel</button>
            <button
              className="btn danger"
              type="button"
              disabled={delModal.busy || (delModal.confirm||'').trim().toLowerCase() !== (delModal.driver?.email||'').trim().toLowerCase()}
              onClick={confirmDelete}
            >{delModal.busy ? 'Deleting…' : 'Delete Driver'}</button>
          </>
        }
      >
        <div style={{display:'grid', gap:12}}>
          <div style={{lineHeight:1.5}}>
            You are about to delete the driver
            {delModal.driver ? <strong> {delModal.driver.firstName} {delModal.driver.lastName}</strong> : null}.
            This will:
            <ul style={{margin:'8px 0 0 18px'}}>
              <li>Remove their account and login credentials immediately.</li>
              <li>Revoke access tokens (deleted users cannot authenticate).</li>
            </ul>
          </div>
          <div>
            <div className="label">Type the driver's email to confirm</div>
            <input
              className="input"
              placeholder={delModal.driver?.email || 'driver@example.com'}
              value={delModal.confirm}
              onChange={e=> setDelModal(m=>({ ...m, confirm: e.target.value, error:'' }))}
              disabled={delModal.busy}
            />
            {delModal.error && <div className="helper-text error">{delModal.error}</div>}
          </div>
        </div>
      </Modal>
    </div>
  )
}
