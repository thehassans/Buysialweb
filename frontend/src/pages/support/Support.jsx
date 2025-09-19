import React, { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost } from '../../api'
import Modal from '../../components/Modal.jsx'

export default function Support(){
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all') // all|open|pending|closed
  const [openNew, setOpenNew] = useState(false)
  const [newForm, setNewForm] = useState({ subject:'', tags:'', body:'' })
  const [active, setActive] = useState(null) // active ticket object
  const [reply, setReply] = useState('')
  const me = useMemo(()=>{ try{ return JSON.parse(localStorage.getItem('me')||'{}') }catch{ return {} } },[])

  async function load(){
    setLoading(true)
    try{ const res = await apiGet('/api/support/tickets'); setTickets(res.tickets||[]) }
    catch(e){ console.error(e) }
    finally{ setLoading(false) }
  }
  useEffect(()=>{ load() }, [])

  const filtered = useMemo(()=> tickets.filter(t => {
    if (status!=='all' && String(t.status)!==status) return false
    const s = [t.subject, ...(t.tags||[])].join(' ').toLowerCase()
    if (q && !s.includes(q.toLowerCase())) return false
    return true
  }), [tickets, q, status])

  function onNewChange(e){ const {name,value} = e.target; setNewForm(f=>({...f,[name]:value})) }
  async function createTicket(){
    const tags = newForm.tags.split(',').map(s=>s.trim()).filter(Boolean)
    await apiPost('/api/support/tickets', { subject: newForm.subject.trim(), body: newForm.body.trim(), tags })
    setOpenNew(false); setNewForm({ subject:'', tags:'', body:'' }); await load()
  }

  async function openTicket(t){
    try{ const res = await apiGet(`/api/support/tickets/${t._id}`); setActive(res.ticket); setReply('') }
    catch(e){ console.error(e) }
  }
  async function sendReply(){
    if (!active) return
    await apiPost(`/api/support/tickets/${active._id}/reply`, { body: reply })
    const res = await apiGet(`/api/support/tickets/${active._id}`)
    setActive(res.ticket); setReply('')
  }
  async function setStatusForActive(s){
    if (!active) return
    await apiPost(`/api/support/tickets/${active._id}/status`, { status: s })
    const res = await apiGet(`/api/support/tickets/${active._id}`)
    setActive(res.ticket); await load()
  }

  return (
    <div className="grid" style={{gap:12}}>
      <div className="card" style={{display:'grid', gap:12}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#64748b,#7c3aed)',display:'grid',placeItems:'center',color:'#fff',fontWeight:800}}>🛟</div>
            <div>
              <div style={{fontWeight:800}}>Support Center</div>
              <div className="helper">Open tickets, chat with support and track status</div>
            </div>
          </div>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <select className="input" value={status} onChange={e=> setStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="closed">Closed</option>
            </select>
            <input className="input" placeholder="Search subject or tag" value={q} onChange={e=> setQ(e.target.value)} />
            <button className="btn" onClick={()=> setOpenNew(true)}>New Ticket</button>
            <button className="btn secondary" onClick={load} disabled={loading}>{loading? 'Refreshing…':'Refresh'}</button>
          </div>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'minmax(260px, 1fr) 2fr', gap:12, alignItems:'start'}}>
          {/* Left list */}
          <div className="card" style={{display:'grid', gap:8}}>
            {filtered.length===0 ? (
              <div style={{padding:12, opacity:.8}}>No tickets found.</div>
            ) : filtered.map(t => {
              const statusCls = t.status==='closed' ? 'danger' : (t.status==='pending' ? 'warn' : 'success')
              return (
                <button key={t._id} type="button" className="group-header" onClick={()=> openTicket(t)} title={t.subject} style={{justifyContent:'space-between'}}>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <span className={`badge ${statusCls}`}>{t.status}</span>
                    <span className="nav-label" style={{fontWeight:600}}>{t.subject}</span>
                  </div>
                  <span className="helper" style={{opacity:.8}}>{(t.tags||[]).join(', ')}</span>
                </button>
              )
            })}
          </div>

          {/* Right details */}
          <div className="card" style={{display:'grid', gap:12}}>
            {!active ? (
              <div style={{padding:12, opacity:.8}}>Select a ticket to view messages.</div>
            ) : (
              <div style={{display:'grid', gap:12}}>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                  <div style={{fontWeight:800}}>{active.subject}</div>
                  <div style={{display:'flex', gap:8}}>
                    <select className="input" value={active.status} onChange={e=> setStatusForActive(e.target.value)}>
                      {['open','pending','closed'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{display:'grid', gap:10, maxHeight:360, overflow:'auto', padding:6, border:'1px solid var(--border)', borderRadius:8}}>
                  {active.messages?.map((m,i)=> (
                    <div key={i} style={{display:'grid', gap:4, background:'var(--panel)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px'}}>
                      <div style={{display:'flex', alignItems:'center', gap:8}}>
                        <span className="badge">{m.role}</span>
                        <span className="helper">{new Date(m.createdAt).toLocaleString()}</span>
                      </div>
                      <div>{m.body}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'grid', gap:8}}>
                  <div className="label">Reply</div>
                  <textarea className="input" rows={3} value={reply} onChange={e=> setReply(e.target.value)} placeholder="Type your reply..." />
                  <div style={{display:'flex', gap:8}}>
                    <button className="btn" onClick={sendReply} disabled={!reply.trim()}>Send</button>
                    <button className="btn secondary" onClick={()=> setReply('')}>Clear</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal title="New Support Ticket" open={openNew} onClose={()=> setOpenNew(false)} footer={(
        <>
          <button className="btn secondary" onClick={()=> setOpenNew(false)}>Cancel</button>
          <button className="btn" onClick={createTicket} disabled={!newForm.subject.trim() || !newForm.body.trim()}>Create</button>
        </>
      )}>
        <div className="form-grid">
          <div>
            <div className="label">Subject</div>
            <input className="input" name="subject" value={newForm.subject} onChange={onNewChange} placeholder="I need help with..." />
          </div>
          <div>
            <div className="label">Tags (comma separated)</div>
            <input className="input" name="tags" value={newForm.tags} onChange={onNewChange} placeholder="billing, courier" />
          </div>
          <div style={{gridColumn:'1 / span 2'}}>
            <div className="label">Message</div>
            <textarea className="input" rows={5} name="body" value={newForm.body} onChange={onNewChange} placeholder="Describe your issue or request" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
