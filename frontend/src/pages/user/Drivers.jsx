import React, { useEffect, useMemo, useState } from 'react'
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input'
import { apiGet, apiPost, apiDelete } from '../../api'

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

  async function deleteDriver(id){
    if(!confirm('Delete this driver?')) return
    try{ await apiDelete(`/api/users/drivers/${id}`); loadDrivers(q) }catch(_e){ alert('Failed to delete') }
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
                      <button className="btn danger" onClick={()=>deleteDriver(u.id)}>Delete</button>
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
    </div>
  )
}
