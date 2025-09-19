import React, { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../../api'

export default function Warehouse(){
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('name')

  useEffect(()=>{ load() },[])

  async function load(){
    setLoading(true)
    setMsg('')
    try{
      const data = await apiGet('/api/warehouse/summary')
      setItems(data.items || [])
    }catch(err){ setMsg(err?.message || 'Failed to load summary') }
    finally{ setLoading(false) }
  }

  const filtered = useMemo(()=>{
    let out = items
    if (q){
      const s = q.toLowerCase()
      out = out.filter(x => (x.name||'').toLowerCase().includes(s))
    }
    if (sort === 'name'){
      out = [...out].sort((a,b)=> (a.name||'').localeCompare(b.name||''))
    } else if (sort === 'stock_desc'){
      out = [...out].sort((a,b)=> (b.stockLeft?.total||0) - (a.stockLeft?.total||0))
    } else if (sort === 'shipped_desc'){
      out = [...out].sort((a,b)=> (b.shipped?.total||0) - (a.shipped?.total||0))
    }
    return out
  }, [items, q, sort])

  function num(n){ return Number(n||0).toLocaleString(undefined, { maximumFractionDigits: 2 }) }

  return (
    <div>
      <div className="card" style={{marginBottom:12}}>
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <div style={{fontWeight:700, fontSize:18}}>Warehouse Summary</div>
          <input className="input" placeholder="Search products" value={q} onChange={e=>setQ(e.target.value)} style={{minWidth:240}} />
          <select className="input" value={sort} onChange={e=>setSort(e.target.value)}>
            <option value="name">Sort: Name</option>
            <option value="stock_desc">Sort: Stock Left (desc)</option>
            <option value="shipped_desc">Sort: Shipped (desc)</option>
          </select>
          <button className="btn" onClick={load} disabled={loading}>{loading? 'Refreshing...' : 'Refresh'}</button>
        </div>
        {msg && <div style={{marginTop:8}}>{msg}</div>}
      </div>

      <div className="card">
        <div style={{fontWeight:600, marginBottom:8}}>Inhouse Products (All Warehouses)</div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0}}>
            <thead>
              <tr>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Product</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Buy Price</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Sell Price</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Stock UAE</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Stock Oman</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Stock KSA</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Stock Bahrain</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Stock Total</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Shipped Total</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Total Bought</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Stock Value</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Potential Revenue</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Shipped Revenue</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13} style={{padding:'10px 12px', opacity:0.7}}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={13} style={{padding:'10px 12px', opacity:0.7}}>No products</td></tr>
              ) : (
                filtered.map(it => (
                  <tr key={it._id}>
                    <td style={{padding:'10px 12px'}}>{it.name}</td>
                    <td style={{padding:'10px 12px'}}>{num(it.purchasePrice)}</td>
                    <td style={{padding:'10px 12px'}}>{num(it.price)}</td>
                    <td style={{padding:'10px 12px'}}>{num(it.stockLeft?.UAE)}</td>
                    <td style={{padding:'10px 12px'}}>{num(it.stockLeft?.Oman)}</td>
                    <td style={{padding:'10px 12px'}}>{num(it.stockLeft?.KSA)}</td>
                    <td style={{padding:'10px 12px'}}>{num(it.stockLeft?.Bahrain)}</td>
                    <td style={{padding:'10px 12px', fontWeight:600}}>{num(it.stockLeft?.total)}</td>
                    <td style={{padding:'10px 12px'}}>{num(it.shipped?.total)}</td>
                    <td style={{padding:'10px 12px'}}>{num(it.totalBought)}</td>
                    <td style={{padding:'10px 12px'}}>{num(it.stockValue)}</td>
                    <td style={{padding:'10px 12px'}}>{num(it.potentialRevenue)}</td>
                    <td style={{padding:'10px 12px'}}>{num(it.shippedRevenue)}</td>
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
