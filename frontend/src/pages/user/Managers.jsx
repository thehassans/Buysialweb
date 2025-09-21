import React, { useEffect, useMemo, useState } from 'react'
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input'
import { API_BASE, apiGet, apiPost, apiDelete } from '../../api'
import { io } from 'socket.io-client'
import Modal from '../../components/Modal.jsx'

export default function Managers(){
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', password:'', phone:'', canCreateAgents:true, canManageProducts:false, canCreateOrders:false })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [delModal, setDelModal] = useState({ open:false, busy:false, error:'', confirm:'', manager:null })

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

  // Real-time refresh when manager is created/deleted in this workspace
  useEffect(()=>{
    let socket
    try{
      const token = localStorage.getItem('token') || ''
      socket = io(API_BASE || undefined, { path: '/socket.io', transports: ['polling','websocket'], auth: { token }, withCredentials: true })
      const refresh = ()=>{ loadManagers(q) }
      socket.on('manager.created', refresh)
      socket.on('manager.deleted', refresh)
    }catch{}
    return ()=>{
      try{ socket && socket.off('manager.created') }catch{}
      try{ socket && socket.off('manager.deleted') }catch{}
      try{ socket && socket.disconnect() }catch{}
    }
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

  function openDelete(manager){ setDelModal({ open:true, busy:false, error:'', confirm:'', manager }) }
  function closeDelete(){ setDelModal(m => ({ ...m, open:false })) }
  async function confirmDelete(){
    const manager = delModal.manager
    if (!manager) return
    const want = (manager.email||'').trim().toLowerCase()
    const typed = (delModal.confirm||'').trim().toLowerCase()
    if (!typed || typed !== want){ setDelModal(m=>({ ...m, error: 'Please type the manager\'s email to confirm.' })); return }
    setDelModal(m=>({ ...m, busy:true, error:'' }))
    try{
      await apiDelete(`/api/users/managers/${manager.id || manager._id}`)
      setDelModal({ open:false, busy:false, error:'', confirm:'', manager:null })
      loadManagers(q)
    }catch(e){ setDelModal(m=>({ ...m, busy:false, error: e?.message || 'Failed to delete manager' })) }
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
                      <button className="btn danger" onClick={()=>openDelete(u)}>Delete</button>
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
      <Modal
        title="Are you sure you want to delete this manager?"
        open={delModal.open}
        onClose={closeDelete}
        footer={
          <>
            <button className="btn secondary" type="button" onClick={closeDelete} disabled={delModal.busy}>Cancel</button>
            <button
              className="btn danger"
              type="button"
              disabled={delModal.busy || (delModal.confirm||'').trim().toLowerCase() !== (delModal.manager?.email||'').trim().toLowerCase()}
              onClick={confirmDelete}
            >{delModal.busy ? 'Deleting…' : 'Delete Manager'}</button>
          </>
        }
      >
        <div style={{display:'grid', gap:12}}>
          <div style={{lineHeight:1.5}}>
            You are about to delete the manager
            {delModal.manager ? <strong> {delModal.manager.firstName} {delModal.manager.lastName}</strong> : null}.
            This will:
            <ul style={{margin:'8px 0 0 18px'}}>
              <li>Remove their account and login credentials immediately.</li>
              <li>Revoke access tokens (deleted users cannot authenticate).</li>
            </ul>
          </div>
          <div>
            <div className="label">Type the manager's email to confirm</div>
            <input
              className="input"
              placeholder={delModal.manager?.email || 'manager@example.com'}
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
