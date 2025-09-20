import React, { useEffect, useState } from 'react'
import { apiGet, API_BASE } from '../../api'

export default function AgentInhouseProducts(){
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  async function load(){
    setLoading(true)
    try{
      const data = await apiGet('/api/products')
      const list = data.products||[]
      list.sort((a,b)=> String(a.name||'').localeCompare(String(b.name||'')))
      setRows(list)
    }catch(_e){ setRows([]) }
    finally{ setLoading(false) }
  }

  useEffect(()=>{ load() },[])

  return (
    <div>
      <div className="card" style={{display:'grid', gap:12}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap'}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#34d399,#60a5fa)',display:'grid',placeItems:'center',color:'#fff',fontWeight:800}}>🏷️</div>
            <div>
              <div style={{fontWeight:800, fontSize:18}}>Inhouse Products</div>
              <div className="helper">Agents can view products and prices but cannot create or edit products.</div>
            </div>
          </div>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <input className="input" placeholder="Search by name, category, country" value={query} onChange={e=>setQuery(e.target.value)} style={{maxWidth:320}} />
            <button className="btn secondary" onClick={load} disabled={loading}>{loading? 'Loading…' : 'Refresh'}</button>
          </div>
        </div>
        <div style={{overflow:'auto'}}>
          <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0}}>
            <thead>
              <tr>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Image</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Name</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Price</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Category</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Made In</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Available In</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{padding:'10px 12px', opacity:0.7}}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} style={{padding:'10px 12px', opacity:0.7}}>No products</td></tr>
              ) : rows
                .filter(p => {
                  if (!query.trim()) return true
                  const q = query.trim().toLowerCase()
                  const hay = [p.name, p.category, p.madeInCountry, ...(p.availableCountries||[])].join(' ').toLowerCase()
                  return hay.includes(q)
                })
                .map(p => (
                <tr key={p._id} style={{borderTop:'1px solid var(--border)'}}>
                  <td style={{padding:'10px 12px'}}>
                    {(() => {
                      const imgs = (p.images && p.images.length > 0) ? p.images : (p.imagePath ? [p.imagePath] : [])
                      if (imgs.length === 0) return '-'
                      const first = imgs[0]
                      return (
                        <img src={`${API_BASE}${first}`} alt={p.name} style={{height:48, width:48, objectFit:'cover', borderRadius:6}} />
                      )
                    })()}
                  </td>
                  <td style={{padding:'10px 12px'}}>{p.name}</td>
                  <td style={{padding:'10px 12px'}}>
                    {(() => {
                      const COUNTRY_TO_CCY = { UAE:'AED', Oman:'OMR', KSA:'SAR', Bahrain:'BHD' }
                      const av = (p.availableCountries||[])
                        .map(c => COUNTRY_TO_CCY[c])
                        .filter(Boolean)
                      const uniq = Array.from(new Set(av))
                      const show = uniq.length > 0 ? uniq : ['AED','OMR','SAR','BHD']
                      return (
                        <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                          {show.map(cc => (
                            <span key={cc} className="badge">{cc} {/* price conversion shown on admin page; for agents show base */}{(p.baseCurrency||'SAR')} {Number(p.price||0).toFixed(2)}</span>
                          ))}
                        </div>
                      )
                    })()}
                  </td>
                  <td style={{padding:'10px 12px'}}>{p.category||'-'}</td>
                  <td style={{padding:'10px 12px'}}>{p.madeInCountry||'-'}</td>
                  <td style={{padding:'10px 12px'}}>
                    {(p.availableCountries||[]).length === 0 ? (
                      <span className="badge warn">No Availability</span>
                    ) : (
                      <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                        {(p.availableCountries||[]).map(c => (
                          <span key={c} className="badge">{c}</span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
