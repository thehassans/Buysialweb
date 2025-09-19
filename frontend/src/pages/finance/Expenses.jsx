import React, { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost } from '../../api'
import Modal from '../../components/Modal.jsx'

export default function Expenses(){
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title:'', category:'general', amount:'', currency:'SAR', notes:'', incurredAt:'' })
  const [msg, setMsg] = useState('')

  async function load(){
    setLoading(true)
    try{
      const res = await apiGet('/api/finance/expenses')
      setItems(res.expenses||[])
    }catch(err){ console.error(err) }
    finally{ setLoading(false) }
  }
  useEffect(()=>{ load() }, [])

  const total = useMemo(()=> items.reduce((a,b)=> a + Number(b.amount||0), 0), [items])

  function onChange(e){ const {name,value} = e.target; setForm(f=>({...f,[name]:value})) }
  async function onSubmit(){
    setMsg('')
    try{
      await apiPost('/api/finance/expenses', { ...form, amount: Number(form.amount||0) })
      setOpen(false)
      setForm({ title:'', category:'general', amount:'', currency:'SAR', notes:'', incurredAt:'' })
      await load()
      setMsg('Expense saved')
      setTimeout(()=> setMsg(''), 1500)
    }catch(err){ setMsg(err?.message||'Failed to save') }
  }

  return (
    <div className="grid" style={{gap:12}}>
      <div className="card" style={{display:'grid', gap:12}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#1f2937,#334155)',display:'grid',placeItems:'center',color:'#fff',fontWeight:800}}>₸</div>
            <div>
              <div style={{fontWeight:800}}>Expense Management</div>
              <div className="helper">Track expenses and control operational costs</div>
            </div>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <div className="badge success">Total: {fmtCurrency(total)}</div>
            <button className="btn" onClick={()=> setOpen(true)}>Add Expense</button>
            <button className="btn secondary" onClick={load} disabled={loading}>{loading? 'Refreshing…':'Refresh'}</button>
          </div>
        </div>

        <div style={{overflow:'auto'}}>
          <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0}}>
            <thead>
              <tr>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Title</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Category</th>
                <th style={{textAlign:'right', padding:'10px 12px'}}>Amount</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Currency</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Notes</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Incurred</th>
              </tr>
            </thead>
            <tbody>
              {loading? (
                <tr><td colSpan={6} style={{padding:12,opacity:.8}}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} style={{padding:12,opacity:.8}}>No expenses yet.</td></tr>
              ) : items.map(e => (
                <tr key={e._id} style={{borderTop:'1px solid var(--border)'}}>
                  <td style={{padding:'10px 12px'}}>{e.title}</td>
                  <td style={{padding:'10px 12px'}}>{e.category||'—'}</td>
                  <td style={{padding:'10px 12px', textAlign:'right'}}>{fmtCurrency(e.amount)}</td>
                  <td style={{padding:'10px 12px'}}>{e.currency||'SAR'}</td>
                  <td style={{padding:'10px 12px', maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={e.notes||''}>{e.notes||'—'}</td>
                  <td style={{padding:'10px 12px'}}>{fmtDate(e.incurredAt||e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal title="Add Expense" open={open} onClose={()=> setOpen(false)} footer={(
        <>
          <button className="btn secondary" onClick={()=> setOpen(false)}>Cancel</button>
          <button className="btn" onClick={onSubmit}>Save</button>
        </>
      )}>
        <div className="form-grid">
          <div>
            <div className="label">Title</div>
            <input className="input" name="title" value={form.title} onChange={onChange} placeholder="Courier fees" />
          </div>
          <div>
            <div className="label">Category</div>
            <input className="input" name="category" value={form.category} onChange={onChange} placeholder="logistics" />
          </div>
          <div>
            <div className="label">Amount</div>
            <input className="input" name="amount" type="number" step="0.01" value={form.amount} onChange={onChange} placeholder="0.00" />
          </div>
          <div>
            <div className="label">Currency</div>
            <select className="input" name="currency" value={form.currency} onChange={onChange}>
              {['SAR','AED','OMR','BHD'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{gridColumn:'1 / span 2'}}>
            <div className="label">Notes</div>
            <input className="input" name="notes" value={form.notes} onChange={onChange} placeholder="optional" />
          </div>
          <div>
            <div className="label">Date</div>
            <input className="input" name="incurredAt" type="date" value={form.incurredAt} onChange={onChange} />
          </div>
        </div>
        {msg && <div className="helper" style={{marginTop:8}}>{msg}</div>}
      </Modal>
    </div>
  )
}

function fmtDate(s){ try{ return new Date(s).toLocaleString() }catch{ return '' } }
function fmtCurrency(n){ const v = Number(n||0); try{ return new Intl.NumberFormat(undefined,{ style:'currency', currency:'USD', maximumFractionDigits:0 }).format(v) }catch{ return `$${Math.round(v).toLocaleString()}` }}
