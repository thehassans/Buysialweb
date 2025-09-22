import React, { useEffect, useMemo, useState } from 'react'
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input'
import { API_BASE, apiGet, apiPost, apiDelete } from '../../api'
import { io } from 'socket.io-client'
import Modal from '../../components/Modal.jsx'

export default function Agents(){
  const [form,setForm] = useState({ firstName:'', lastName:'', phone:'', email:'', password:'' })
  const [loading,setLoading] = useState(false)
  const [msg,setMsg] = useState('')
  const [q,setQ] = useState('')
  const [rows,setRows] = useState([])
  const [loadingList,setLoadingList] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [metrics, setMetrics] = useState([])
  const [me, setMe] = useState(null)
  const [delModal, setDelModal] = useState({ open:false, busy:false, error:'', confirm:'', agent:null })
  const [resendingId, setResendingId] = useState('')
  const totals = useMemo(()=>{
    const totalAssigned = metrics.reduce((s,m)=> s + (m?.assigned||0), 0)
    const totalDone = metrics.reduce((s,m)=> s + (m?.done||0), 0)
    const avgResponseSeconds = (()=>{
      const vals = metrics.map(m=> m?.avgResponseSeconds).filter(v=> typeof v === 'number' && v>=0)
      if (!vals.length) return null
      const sum = vals.reduce((s,v)=> s+v, 0)
      return Math.round(sum / vals.length)
    })()
    return { totalAssigned, totalDone, avgResponseSeconds }
  }, [metrics])

  function onChange(e){
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  async function loadAgents(query=''){
    setLoadingList(true)
    try{
      const data = await apiGet(`/api/users/agents?q=${encodeURIComponent(query)}`)
      setRows(data.users||[])
    }catch(_e){}
    finally{ setLoadingList(false)}
  }

  async function loadPerformance(){
    try{
      const data = await apiGet('/api/users/agents/performance')
      setMetrics(data.metrics || [])
    }catch(_e){ setMetrics([]) }
  }

  useEffect(()=>{ loadAgents(''); loadPerformance() },[])

  // Load current user to determine permissions
  useEffect(()=>{
    (async ()=>{ try{ const { user } = await apiGet('/api/users/me'); setMe(user||null) }catch{ setMe(null) } })()
  },[])

  const canCreate = !!(me && (me.role === 'admin' || me.role === 'user' || (me.role === 'manager' && me.managerPermissions && me.managerPermissions.canCreateAgents)))

  // small debounce for search
  useEffect(()=>{
    const id = setTimeout(()=> loadAgents(q), 300)
    return ()=> clearTimeout(id)
  },[q])

  // re-load performance when agents list updates
  useEffect(()=>{ if(rows?.length>=0) loadPerformance() }, [rows.length])

  // Live refresh: when orders change in workspace, refresh performance metrics
  useEffect(()=>{
    let socket
    try{
      const token = localStorage.getItem('token') || ''
      socket = io(API_BASE || undefined, { path: '/socket.io', transports: ['polling','websocket'], auth: { token }, withCredentials: true })
      const refresh = ()=>{ loadPerformance() }
      socket.on('orders.changed', refresh)
      const onAgentDeleted = ()=>{ try{ loadAgents(q); loadPerformance() }catch{} }
      socket.on('agent.deleted', onAgentDeleted)
    }catch{}
    return ()=>{
      try{ socket && socket.off('orders.changed') }catch{}
      try{ socket && socket.off('agent.deleted') }catch{}
      try{ socket && socket.disconnect() }catch{}
    }
  },[])

  async function onSubmit(e){
    e.preventDefault()
    setMsg('')
    setLoading(true)
    try{
      // Basic validation for phone number
      if (form.phone && !isValidPhoneNumber(form.phone)){
        setLoading(false)
        setPhoneError('Enter a valid phone number with country code')
        setMsg('')
        return
      }
      const payload = { ...form, phone: form.phone }
      const res = await apiPost('/api/users/agents', payload)
      setMsg('Agent created successfully')
      setForm({ firstName:'', lastName:'', phone:'', email:'', password:'' })
      setPhoneError('')
      loadAgents(q)
    }catch(err){
      setMsg(err?.message || 'Failed to create agent')
    }finally{
      setLoading(false)
    }
  }

  async function resendWelcome(u){
    try{
      const uid = String(u?.id || u?._id || '')
      if (!uid) return
      setMsg('')
      setResendingId(uid)
      await apiPost(`/api/users/agents/${uid}/resend-welcome`, {})
      await loadAgents(q)
      setMsg('Welcome message re-sent')
    }catch(err){
      setMsg(err?.message || 'Failed to resend welcome')
    }finally{
      setResendingId('')
    }
  }

  function openDelete(agent){ setDelModal({ open:true, busy:false, error:'', confirm:'', agent }) }
  function closeDelete(){ setDelModal(m=>({ ...m, open:false })) }
  async function confirmDelete(){
    const agent = delModal.agent
    if (!agent) return
    const want = (agent.email||'').trim().toLowerCase()
    const typed = (delModal.confirm||'').trim().toLowerCase()
    if (!typed || typed !== want){ setDelModal(m=>({ ...m, error:'Please type the agent\'s email to confirm.' })); return }
    setDelModal(m=>({ ...m, busy:true, error:'' }))
    try{
      await apiDelete(`/api/users/agents/${agent.id}`)
      setDelModal({ open:false, busy:false, error:'', confirm:'', agent:null })
      loadAgents(q); loadPerformance()
    }catch(e){
      setDelModal(m=>({ ...m, busy:false, error: e?.message || 'Failed to delete agent' }))
    }
  }

  function fmtDate(s){ try{ return new Date(s).toLocaleString() }catch{ return ''} }

  return (
    <div className="section">
      {/* Page header */}
      <div className="page-header">
        <div>
          <div className="page-title gradient heading-blue">Agents</div>
          <div className="page-subtitle">Create and manage your sales agents. Track performance at a glance.</div>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="kpis">
        <div className="kpi">
          <div className="label">Total Assigned</div>
          <div className="value">{totals.totalAssigned}</div>
        </div>
        <div className="kpi">
          <div className="label">Total Done</div>
          <div className="value">{totals.totalDone}</div>
        </div>
        <div className="kpi">
          <div className="label">Avg First Response</div>
          <div className="value">{(function(){ const s=totals.avgResponseSeconds; if(s==null) return '-'; if(s<60) return `${s}s`; const m=Math.floor(s/60), sec=s%60; return `${m}m ${sec}s`;})()}</div>
        </div>
      </div>

      {/* Create Agent (hidden if manager lacks permission) */}
      {canCreate && (
      <div className="card">
        <div className="card-header">
          <div className="card-title modern">Create Agent</div>
          <div className="card-subtitle">Invite a new agent to your workspace</div>
        </div>
        <form onSubmit={onSubmit} className="section">
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
              <div className="label">Phone Number</div>
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
              <div className="label">Email</div>
              <input className="input" type="email" name="email" value={form.email} onChange={onChange} placeholder="agent@example.com" required autoComplete="email" />
            </div>
          </div>
          <div>
            <div className="label">Password</div>
            <input className="input" type="password" name="password" value={form.password} onChange={onChange} placeholder="Minimum 6 characters" required autoComplete="new-password" />
          </div>
          <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
            <button className="btn" type="submit" disabled={loading}>{loading? 'Creating...' : 'Create Agent'}</button>
          </div>
          {msg && <div style={{opacity:0.9}}>{msg}</div>}
        </form>
      </div>
      )}

      {/* Agents List */}
      <div className="card" style={{marginTop:12, display:'grid', gap:12}}>
        <div className="card-header">
          <div className="card-title">Your Agents</div>
          <input className="input" placeholder="Search by name, email, phone" value={q} onChange={e=>setQ(e.target.value)} style={{maxWidth:320}}/>
        </div>
        <div style={{overflow:'auto'}}>
          <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0}}>
            <thead>
              <tr>
                <th style={{textAlign:'left', padding:'10px 12px', position:'sticky', top:0}}>Name</th>
                <th style={{textAlign:'left', padding:'10px 12px', position:'sticky', top:0}}>Email</th>
                <th style={{textAlign:'left', padding:'10px 12px', position:'sticky', top:0}}>Phone</th>
                <th style={{textAlign:'left', padding:'10px 12px', position:'sticky', top:0}}>Welcome</th>
                <th style={{textAlign:'left', padding:'10px 12px', position:'sticky', top:0}}>Assigned</th>
                <th style={{textAlign:'left', padding:'10px 12px', position:'sticky', top:0}}>Done</th>
                <th style={{textAlign:'left', padding:'10px 12px', position:'sticky', top:0}}>Avg Response</th>
                <th style={{textAlign:'left', padding:'10px 12px', position:'sticky', top:0}}>Created</th>
                <th style={{textAlign:'right', padding:'10px 12px', position:'sticky', top:0}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr><td colSpan={9} style={{padding:12, opacity:0.7}}>Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} style={{padding:12, opacity:0.7}}>No agents found</td></tr>
              ) : (
                rows.map(u=> {
                  const uid = String(u.id || u._id || '')
                  const m = metrics.find(m=> String(m.id||'') === uid)
                  return (
                  <tr key={uid || u.email || `${u.firstName}-${u.lastName}`} style={{borderTop:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 12px'}}>{u.firstName} {u.lastName}</td>
                    <td style={{padding:'10px 12px'}}>{u.email}</td>
                    <td style={{padding:'10px 12px'}}>{u.phone||'-'}</td>
                    <td style={{padding:'10px 12px'}}>
                      {(function(){
                        const ok = !!u.welcomeSent
                        const err = (u.welcomeError||'').trim()
                        const label = ok ? 'Welcome message sent' : (err ? `Failed: ${err}` : 'Pending')
                        return (
                          <span title={label} aria-label={label} style={{display:'inline-flex', alignItems:'center', gap:6}}>
                            <span style={{display:'inline-block', width:10, height:10, borderRadius:999, background: ok? '#22c55e' : '#ef4444'}} />
                            <span style={{opacity:0.9}}>{ok? 'Sent' : (err? 'Failed' : 'Pending')}</span>
                          </span>
                        )
                      })()}
                    </td>
                    <td style={{padding:'10px 12px'}}>{m?.assigned ?? 0}</td>
                    <td style={{padding:'10px 12px'}}>{m?.done ?? 0}</td>
                    <td style={{padding:'10px 12px'}}>{(()=>{ const s = m?.avgResponseSeconds; if(s==null) return '-'; if(s<60) return `${s}s`; const mins=Math.floor(s/60), sec=s%60; return `${mins}m ${sec}s`; })()}</td>
                    <td style={{padding:'10px 12px'}}>{fmtDate(u.createdAt)}</td>
                    <td style={{padding:'10px 12px', textAlign:'right', display:'flex', gap:8, justifyContent:'flex-end'}}>
                      <button className="btn secondary" disabled={!!resendingId && resendingId===uid} onClick={()=>resendWelcome({ ...u, id: uid })}>
                        {resendingId===uid ? 'Resending…' : 'Resend Welcome'}
                      </button>
                      <button className="btn danger" onClick={()=>openDelete({ ...u, id: uid })}>Delete</button>
                    </td>
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div style={{fontSize:12, opacity:0.8, display:'grid', gap:4}}>
          <div>Agents can sign in at <code>/agent</code> using the email and password above.</div>
          {rows.some(r => (r.welcomeSent===false && String(r.welcomeError||'').includes('wa-not-connected'))) && (
            <div className="helper-text" style={{color:'var(--muted)'}}>Note: Some welcome messages failed because WhatsApp is not connected. Please connect WhatsApp from Inbox → Connect and try again.</div>
          )}
        </div>
      </div>
      {/* Delete Agent Modal */}
      <Modal
        title="Are you sure you want to delete this agent?"
        open={delModal.open}
        onClose={closeDelete}
        footer={
          <>
            <button className="btn secondary" type="button" onClick={closeDelete} disabled={delModal.busy}>Cancel</button>
            <button
              className="btn danger"
              type="button"
              disabled={delModal.busy || (delModal.confirm||'').trim().toLowerCase() !== (delModal.agent?.email||'').trim().toLowerCase()}
              onClick={confirmDelete}
            >{delModal.busy ? 'Deleting…' : 'Delete Agent'}</button>
          </>
        }
      >
        <div style={{display:'grid', gap:12}}>
          <div style={{lineHeight:1.5}}>
            You are about to delete the agent
            {delModal.agent ? <strong> {delModal.agent.firstName} {delModal.agent.lastName}</strong> : null}.
            This will:
            <ul style={{margin:'8px 0 0 18px'}}>
              <li>Remove their account and login credentials immediately.</li>
              <li>Revoke access tokens (deleted users cannot authenticate).</li>
              <li>Clean up WhatsApp chat assignments related to this agent.</li>
            </ul>
          </div>
          <div>
            <div className="label">Type the agent's email to confirm</div>
            <input
              className="input"
              placeholder={delModal.agent?.email || 'agent@example.com'}
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
