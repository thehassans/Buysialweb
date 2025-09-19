import React, { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../../api'

export default function Transactions(){
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  async function load(){
    setLoading(true)
    try{
      const qs = []
      if (start) qs.push(`start=${encodeURIComponent(start)}`)
      if (end) qs.push(`end=${encodeURIComponent(end)}`)
      const url = `/api/finance/transactions${qs.length? ('?'+qs.join('&')):''}`
      const res = await apiGet(url)
      setRows(res.transactions||[])
    }catch(err){ console.error(err) }
    finally{ setLoading(false) }
  }
  useEffect(()=>{ load() }, [])

  const totals = useMemo(()=>{
    const credits = rows.filter(r=> r.type==='credit').reduce((a,b)=> a + Number(b.amount||0), 0)
    const debits = rows.filter(r=> r.type==='debit').reduce((a,b)=> a + Number(b.amount||0), 0)
    return { credits, debits, net: credits - debits }
  }, [rows])

  function exportCSV(){
    const header = ['Date','Type','Source','Ref','Amount','Currency','Notes']
    const data = rows.map(r => [new Date(r.date).toISOString(), r.type, r.source, r.ref, r.amount, r.currency, (r.notes||'').replace(/\n/g,' ')])
    const csv = [header, ...data].map(r => r.map(x => typeof x==='string' && x.includes(',') ? `"${x}"` : x).join(',')).join('\n')
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'transactions.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="grid" style={{gap:12}}>
      <div className="card" style={{display:'grid', gap:12}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#0ea5e9,#a78bfa)',display:'grid',placeItems:'center',color:'#fff',fontWeight:800}}>₿</div>
            <div>
              <div style={{fontWeight:800}}>Transactions</div>
              <div className="helper">Ledger of credits, debits and running totals</div>
            </div>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <div className="badge" style={{background:'#0f3f33', border:'1px solid #065f46', color:'#c7f9ec'}}>Credits: {fmtCurrency(totals.credits)}</div>
            <div className="badge" style={{background:'#3b0d0d', border:'1px solid #7f1d1d', color:'#fecaca'}}>Debits: {fmtCurrency(totals.debits)}</div>
            <div className="badge" style={{background:'var(--panel)', border:'1px solid var(--border)'}}>Net: {fmtCurrency(totals.net)}</div>
            <button className="btn secondary" onClick={exportCSV}>Export CSV</button>
          </div>
        </div>

        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <div>
            <div className="label">Start</div>
            <input className="input" type="date" value={start} onChange={e=>setStart(e.target.value)} />
          </div>
          <div>
            <div className="label">End</div>
            <input className="input" type="date" value={end} onChange={e=>setEnd(e.target.value)} />
          </div>
          <div style={{alignSelf:'end'}}>
            <button className="btn" onClick={load} disabled={loading}>{loading? 'Loading…' : 'Apply'}</button>
          </div>
        </div>

        <div style={{overflow:'auto'}}>
          <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0}}>
            <thead>
              <tr>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Date</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Type</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Source</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Reference</th>
                <th style={{textAlign:'right', padding:'10px 12px'}}>Amount</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Currency</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading? (
                <tr><td colSpan={7} style={{padding:12,opacity:.8}}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} style={{padding:12,opacity:.8}}>No transactions found for the selected range.</td></tr>
              ) : rows.map((t, i) => (
                <tr key={i} style={{borderTop:'1px solid var(--border)'}}>
                  <td style={{padding:'10px 12px'}}>{fmtDate(t.date)}</td>
                  <td style={{padding:'10px 12px'}}>{t.type}</td>
                  <td style={{padding:'10px 12px'}}>{t.source}</td>
                  <td style={{padding:'10px 12px'}}>{t.ref}</td>
                  <td style={{padding:'10px 12px', textAlign:'right'}}>{fmtCurrency(t.amount)}</td>
                  <td style={{padding:'10px 12px'}}>{t.currency}</td>
                  <td style={{padding:'10px 12px'}}>{t.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function fmtDate(s){ try{ return new Date(s).toLocaleString() }catch{ return '' } }
function fmtCurrency(n){ const v = Number(n||0); try{ return new Intl.NumberFormat(undefined,{ style:'currency', currency:'USD', maximumFractionDigits:0 }).format(v) }catch{ return `$${Math.round(v).toLocaleString()}` }}
