import React, { useEffect, useMemo, useState } from 'react'
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input'
import { apiGet, apiPost, apiDelete } from '../../api'
import { useToast } from '../../ui/Toast.jsx'

export default function Managers(){
  const toast = useToast()
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', password:'', phone:'', canCreateAgents:true, canManageProducts:false, canCreateOrders:false })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  function onChange(e){
    const { name, type, value, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  async function loadManagers(query=''){
    setLoadingList(true)
    try{
      const data = await apiGet(`/api/users/managers?q=${encodeURIComponent(query)}`)
      setRows(data.users||[])
    }catch(_e){ setRows([]) }
    finally{ setLoadingList(false) }
  }

  useEffect(()=>{ loadManagers('') },[])

  // small debounce for search
  useEffect(()=>{
    const id = setTimeout(()=> loadManagers(q), 300)
    return ()=> clearTimeout(id)
  },[q])

  async function onSubmit(e){
    e.preventDefault()
    setMsg('')
    setLoading(true)
    try{
      // validate phone if provided
      if (form.phone && !isValidPhoneNumber(form.phone)){
        setLoading(false)
        setPhoneError('Enter a valid phone number with country code')
        setMsg('')
        return
      }
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        phone: form.phone,
        canCreateAgents: !!form.canCreateAgents,
        canManageProducts: !!form.canManageProducts,
        canCreateOrders: !!form.canCreateOrders,
      }
      await apiPost('/api/users/managers', payload)
      setMsg('Manager created successfully')
      setForm({ firstName:'', lastName:'', email:'', password:'', phone:'', canCreateAgents:true, canManageProducts:false, canCreateOrders:false })
      setPhoneError('')
      loadManagers(q)
    }catch(err){ setMsg(err?.message || 'Failed to create manager') }
    finally{ setLoading(false) }
  }

  async function deleteManager(id){
    if(!confirm('Delete this manager?')) return
    try{
      setDeletingId(id)
      await apiDelete(`/api/users/managers/${id}`)
      try{ toast.success('Manager deleted') }catch{}
      loadManagers(q)
    }catch(e){
      try{ toast.error(e?.message || 'Failed to delete manager') }catch{}
    }finally{
      setDeletingId(null)
    }
  }

  function fmtDate(s){ try{ return new Date(s).toLocaleString() }catch{ return ''} }

  return (
    <div className="section">
      {/* Page header */}
      <div className="page-header">
        <div>
          <div className="page-title gradient heading-green">Managers</div>
          <div className="page-subtitle">Create and manage managers with specific permissions.</div>
        </div>
      </div>

      {/* Create Manager */}
      <div className="card">
        <div className="card-header">
          <div className="card-title modern">Create Manager</div>
          <div className="card-subtitle">Grant permissions using the checkboxes</div>
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
              <input className="input" type="email" name="email" value={form.email} onChange={onChange} placeholder="manager@example.com" required autoComplete="email" />
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
          </div>
          <div>
            <div className="label">Password</div>
            <input className="input" type="password" name="password" value={form.password} onChange={onChange} placeholder="Minimum 6 characters" required autoComplete="new-password" />
          </div>
          <div style={{display:'flex', gap:16, flexWrap:'wrap'}}>
            <label className="badge" style={{display:'inline-flex', alignItems:'center', gap:8, cursor:'pointer'}}>
              <input type="checkbox" name="canCreateAgents" checked={form.canCreateAgents} onChange={onChange} /> Can create agents
            </label>
            <label className="badge" style={{display:'inline-flex', alignItems:'center', gap:8, cursor:'pointer'}}>
              <input type="checkbox" name="canManageProducts" checked={form.canManageProducts} onChange={onChange} /> Can manage inhouse products
            </label>
            <label className="badge" style={{display:'inline-flex', alignItems:'center', gap:8, cursor:'pointer'}}>
              <input type="checkbox" name="canCreateOrders" checked={form.canCreateOrders} onChange={onChange} /> Can create orders
            </label>
          </div>
          <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
            <button className="btn" type="submit" disabled={loading}>{loading? 'Creating...' : 'Create Manager'}</button>
          </div>
          {msg && <div style={{opacity:0.9}}>{msg}</div>}
        </form>
      </div>

      {/* Managers List */}
      <div className="card" style={{marginTop:12, display:'grid', gap:12}}>
        <div className="card-header">
          <div className="card-title">Your Managers</div>
          <input className="input" placeholder="Search by name or email" value={q} onChange={e=>setQ(e.target.value)} style={{maxWidth:320}}/>
        </div>
        <div style={{overflow:'auto'}}>
          <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0}}>
            <thead>
              <tr>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Name</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Email</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Permissions</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Created</th>
                <th style={{textAlign:'right', padding:'10px 12px'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr><td colSpan={5} style={{padding:12, opacity:0.7}}>Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} style={{padding:12, opacity:0.7}}>No managers found</td></tr>
              ) : (
                rows.map(u=> (
                  <tr key={u.id || u._id} style={{borderTop:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 12px'}}>{u.firstName} {u.lastName}</td>
                    <td style={{padding:'10px 12px'}}>{u.email}</td>
                    <td style={{padding:'10px 12px'}}>
                      <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                        {u.managerPermissions?.canCreateAgents ? <span className="badge">Agents</span> : null}
                        {u.managerPermissions?.canManageProducts ? <span className="badge">Products</span> : null}
                        {u.managerPermissions?.canCreateOrders ? <span className="badge">Orders</span> : null}
                        {(!u.managerPermissions || (!u.managerPermissions.canCreateAgents && !u.managerPermissions.canManageProducts && !u.managerPermissions.canCreateOrders)) && <span className="badge warn">No Permissions</span>}
                      </div>
                    </td>
                    <td style={{padding:'10px 12px'}}>{fmtDate(u.createdAt)}</td>
                    <td style={{padding:'10px 12px', textAlign:'right'}}>
                      <button className="btn danger" disabled={deletingId === (u.id || u._id)} onClick={()=>deleteManager(u.id || u._id)}>
                        {deletingId === (u.id || u._id) ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div style={{fontSize:12, opacity:0.8}}>
          Managers can sign in at <code>/login</code> using the email and password above. They will be redirected to <code>/manager</code>.
        </div>
      </div>
    </div>
  )
}
