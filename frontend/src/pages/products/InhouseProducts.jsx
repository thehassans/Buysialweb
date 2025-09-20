import React, { useEffect, useState } from 'react'
import { apiGet, apiUpload, apiPatch, apiDelete, apiUploadPatch, API_BASE } from '../../api'

  // Convert ISO 3166-1 alpha-2 country code to emoji flag
  function codeToFlag(code){
    if (!code) return ''
    const base = 127397
    return code
      .toUpperCase()
      .replace(/[^A-Z]/g,'')
      .split('')
      .map(c => String.fromCodePoint(base + c.charCodeAt(0)))
      .join('')
  }

export default function InhouseProducts(){
  const [isMobile, setIsMobile] = useState(()=> (typeof window!=='undefined' ? window.innerWidth <= 768 : false))
  const [me, setMe] = useState(null)
  const COUNTRY_OPTS = [
    { key:'UAE', name:'UAE', flag:'🇦🇪' },
    { key:'Oman', name:'Oman', flag:'🇴🇲' },
    { key:'KSA', name:'KSA', flag:'🇸🇦' },
    { key:'Bahrain', name:'Bahrain', flag:'🇧🇭' },
  ]
  const [worldCountries, setWorldCountries] = useState([])
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ name:'', price:'', purchasePrice:'', baseCurrency:'SAR', category:'Other', madeInCountry:'', description:'', availableCountries: [], inStock: true, stockUAE: 0, stockOman: 0, stockKSA: 0, stockBahrain: 0, images: [] })
  const [imagePreviews, setImagePreviews] = useState([])
  const [editing, setEditing] = useState(null) // holds product doc when editing
  const [editForm, setEditForm] = useState(null)
  const [editPreviews, setEditPreviews] = useState([])
  // Gallery/lightbox state
  const [gallery, setGallery] = useState({ open:false, images:[], index:0, zoom:1 })
  // Quick popups
  const [stockPopup, setStockPopup] = useState({ open:false, product:null, stockUAE:0, stockOman:0, stockKSA:0, stockBahrain:0, inStock:true })
  const [pricePopup, setPricePopup] = useState({ open:false, product:null, baseCurrency:'SAR', price:'', purchasePrice:'', x:0, y:0 })

  function openGallery(images, startIdx=0){
    const imgs = (images||[]).filter(Boolean)
    if (!imgs.length) return
    setGallery({ open:true, images: imgs, index: Math.max(0, Math.min(startIdx, imgs.length-1)), zoom: 1 })
  }
  function closeGallery(){ setGallery(g => ({ ...g, open:false })) }
  function nextImg(){ setGallery(g => ({ ...g, index: (g.index + 1) % g.images.length, zoom:1 })) }
  function prevImg(){ setGallery(g => ({ ...g, index: (g.index - 1 + g.images.length) % g.images.length, zoom:1 })) }
  function zoomIn(){ setGallery(g => ({ ...g, zoom: Math.min(4, g.zoom + 0.25) })) }
  function zoomOut(){ setGallery(g => ({ ...g, zoom: Math.max(0.5, g.zoom - 0.25) })) }
  function resetZoom(){ setGallery(g => ({ ...g, zoom: 1 })) }

  // Close popups with Escape key
  useEffect(() => {
    function onKey(e){
      if (e.key === 'Escape'){
        setPricePopup(pp => pp.open ? { open:false, product:null, baseCurrency:'SAR', price:'', purchasePrice:'', x:0, y:0 } : pp)
        setStockPopup(sp => sp.open ? { open:false, product:null, stockUAE:0, stockOman:0, stockKSA:0, stockBahrain:0, inStock:true } : sp)
        setGallery(g => g.open ? { ...g, open:false } : g)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(()=>{
    function onResize(){ setIsMobile(window.innerWidth <= 768) }
    window.addEventListener('resize', onResize)
    return ()=> window.removeEventListener('resize', onResize)
  },[])

  function openStockPopup(p){
    setStockPopup({
      open:true,
      product:p,
      stockUAE: p.stockByCountry?.UAE ?? 0,
      stockOman: p.stockByCountry?.Oman ?? 0,
      stockKSA: p.stockByCountry?.KSA ?? 0,
      stockBahrain: p.stockByCountry?.Bahrain ?? 0,
      inStock: !!p.inStock,
    })
  }
  function openPricePopup(ev, p){
    const rect = ev.currentTarget.getBoundingClientRect()
    const x = rect.left + window.scrollX
    const y = rect.bottom + window.scrollY + 6
    setPricePopup({ open:true, product:p, baseCurrency: p.baseCurrency||'SAR', price: String(p.price||''), purchasePrice: String(p.purchasePrice||''), x, y })
  }
  async function saveStockPopup(){
    const p = stockPopup
    if (!p.product) return
    try{
      await apiPatch(`/api/products/${p.product._id}`, {
        inStock: p.inStock,
        stockUAE: p.stockUAE,
        stockOman: p.stockOman,
        stockKSA: p.stockKSA,
        stockBahrain: p.stockBahrain,
      })
      setStockPopup({ open:false, product:null, stockUAE:0, stockOman:0, stockKSA:0, stockBahrain:0, inStock:true })
      load()
    }catch(err){ alert(err?.message||'Failed to save stock') }
  }
  async function savePricePopup(){
    const p = pricePopup
    if (!p.product) return
    try{
      await apiPatch(`/api/products/${p.product._id}`, {
        baseCurrency: p.baseCurrency,
        price: Number(p.price),
        purchasePrice: p.purchasePrice === '' ? '' : Number(p.purchasePrice),
      })
      setPricePopup({ open:false, product:null, baseCurrency:'SAR', price:'', purchasePrice:'', x:0, y:0 })
      load()
    }catch(err){ alert(err?.message||'Failed to save prices') }
  }

  function onChange(e){
    const { name, value, type, checked, files } = e.target
    if (type === 'checkbox') setForm(f => ({ ...f, [name]: checked }))
    else if (type === 'file'){
      const arr = Array.from(files||[])
      setForm(f => ({ ...f, images: arr }))
      setImagePreviews(arr.map(f => ({ name: f.name, url: URL.createObjectURL(f) })))
    } else setForm(f => ({ ...f, [name]: value }))
  }

  function toggleCountry(k){
    setForm(f => {
      const has = f.availableCountries.includes(k)
      return { ...f, availableCountries: has ? f.availableCountries.filter(x=>x!==k) : [...f.availableCountries, k] }
    })
  }

  // Load world countries with flags
  useEffect(()=>{
    (async ()=>{
      try{
        const res = await fetch('https://restcountries.com/v3.1/all?fields=name,cca2,flags')
        const data = await res.json()
        const list = (data||[]).map(c => ({
          code: c.cca2,
          name: c.name?.common || '',
          flag: codeToFlag(c.cca2),
        })).filter(x => x.name && x.code)
        // sort by name
        list.sort((a,b)=> a.name.localeCompare(b.name))
        setWorldCountries(list)
      }catch(_){ setWorldCountries([]) }
    })()
  },[])

  async function load(){
    setLoading(true)
    try{
      const data = await apiGet('/api/products')
      const list = data.products||[]
      // Basic sort by name asc for stable display
      list.sort((a,b)=> String(a.name||'').localeCompare(String(b.name||'')))
      setRows(list)
    }catch(err){ setMsg(err?.message||'Failed to load products') }
    finally{ setLoading(false) }
  }

  useEffect(()=>{ load() },[])

  // Load current user to determine permissions
  useEffect(()=>{
    (async ()=>{
      try{ const { user } = await apiGet('/api/users/me'); setMe(user||null) }catch{ setMe(null) }
    })()
  },[])

  const canManage = !!(me && (me.role === 'admin' || me.role === 'user' || (me.role === 'manager' && me.managerPermissions && me.managerPermissions.canManageProducts)))

  async function onCreate(e){
    e.preventDefault()
    setMsg('')
    setSaving(true)
    try{
      const fd = new FormData()
      fd.append('name', form.name)
      fd.append('price', form.price)
      if (form.purchasePrice) fd.append('purchasePrice', form.purchasePrice)
      fd.append('availableCountries', form.availableCountries.join(','))
      fd.append('baseCurrency', form.baseCurrency)
      fd.append('category', form.category)
      fd.append('madeInCountry', form.madeInCountry)
      fd.append('description', form.description)
      fd.append('inStock', String(form.inStock))
      fd.append('stockUAE', String(form.stockUAE))
      fd.append('stockOman', String(form.stockOman))
      fd.append('stockKSA', String(form.stockKSA))
      fd.append('stockBahrain', String(form.stockBahrain))
      for (const f of (form.images||[])) fd.append('images', f)
      await apiUpload('/api/products', fd)
      setForm({ name:'', price:'', purchasePrice:'', baseCurrency:'SAR', category:'Other', madeInCountry:'', description:'', availableCountries:[], inStock: true, stockUAE: 0, stockOman: 0, stockKSA: 0, stockBahrain: 0, images: [] })
      setImagePreviews([])
      setMsg('Product created')
      load()
    }catch(err){ setMsg(err?.message || 'Failed to create product') }
    finally{ setSaving(false) }
  }

  async function onDelete(id){
    if (!confirm('Delete this product?')) return
    try{ await apiDelete(`/api/products/${id}`); load() }catch(err){ alert(err?.message||'Failed') }
  }

  async function onToggleStock(p){
    try{
      await apiPatch(`/api/products/${p._id}`, { inStock: !p.inStock })
      load()
    }catch(err){ alert(err?.message||'Failed') }
  }

  function openEdit(p){
    setEditing(p)
    setEditForm({
      name: p.name||'',
      price: p.price||'',
      purchasePrice: p.purchasePrice||'',
      baseCurrency: p.baseCurrency||'SAR',
      category: p.category||'Other',
      madeInCountry: p.madeInCountry||'',
      description: p.description||'',
      availableCountries: p.availableCountries||[],
      inStock: !!p.inStock,
      stockUAE: p.stockByCountry?.UAE || 0,
      stockOman: p.stockByCountry?.Oman || 0,
      stockKSA: p.stockByCountry?.KSA || 0,
      stockBahrain: p.stockByCountry?.Bahrain || 0,
      images: [],
    })
    setEditPreviews([])
  }

  function onEditChange(e){
    const { name, value, type, checked, files } = e.target
    if (type === 'checkbox') setEditForm(f => ({ ...f, [name]: checked }))
    else if (type === 'file'){
      const arr = Array.from(files||[])
      setEditForm(f => ({ ...f, images: arr }))
      setEditPreviews(arr.map(f => ({ name: f.name, url: URL.createObjectURL(f) })))
    } else setEditForm(f => ({ ...f, [name]: value }))
  }

  async function onEditSave(){
    if (!editing || !editForm) return
    try{
      const fd = new FormData()
      fd.append('name', editForm.name)
      fd.append('price', editForm.price)
      fd.append('purchasePrice', editForm.purchasePrice)
      fd.append('availableCountries', (editForm.availableCountries||[]).join(','))
      fd.append('baseCurrency', editForm.baseCurrency)
      fd.append('category', editForm.category)
      fd.append('madeInCountry', editForm.madeInCountry)
      fd.append('description', editForm.description)
      fd.append('inStock', String(editForm.inStock))
      fd.append('stockUAE', String(editForm.stockUAE))
      fd.append('stockOman', String(editForm.stockOman))
      fd.append('stockKSA', String(editForm.stockKSA))
      fd.append('stockBahrain', String(editForm.stockBahrain))
      for (const f of (editForm.images||[])) fd.append('images', f)
      await apiUploadPatch(`/api/products/${editing._id}`, fd)
      setEditing(null)
      setEditForm(null)
      setEditPreviews([])
      load()
    }catch(err){ alert(err?.message||'Failed to update') }
  }

  const RATES = {
    // Approx cross rates relative to SAR
    SAR: { SAR: 1, AED: 0.98, OMR: 0.10, BHD: 0.10 },
    AED: { SAR: 1.02, AED: 1, OMR: 0.10, BHD: 0.10 },
    OMR: { SAR: 9.78, AED: 9.58, OMR: 1, BHD: 0.98 },
    BHD: { SAR: 9.94, AED: 9.74, OMR: 1.02, BHD: 1 },
  }

  function convertPrice(value, from, to){
    const v = Number(value||0)
    const r = RATES[from]?.[to]
    if (!r) return v
    return v * r
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title gradient heading-orange">Create Product</div>
          <div className="page-subtitle">Add a new product with pricing and stock per country</div>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <a href="#products-list" className="btn secondary">Go to Products</a>
        </div>
      </div>

      {canManage && (
      <div className="card" style={{display:'grid', gap:12}}>
        <form onSubmit={onCreate} style={{display:'grid', gap:12}}>
          <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr 1fr', gap:12}}>
            <div>
              <div className="label">Name</div>
              <input className="input" name="name" value={form.name} onChange={onChange} placeholder="Product name" required />
            </div>
            <div>
              <div className="label">Price</div>
              <input className="input" type="number" min="0" step="0.01" name="price" value={form.price} onChange={onChange} placeholder="0.00" required />
            </div>
            <div>
              <div className="label">Purchase Price</div>
              <input className="input" type="number" min="0" step="0.01" name="purchasePrice" value={form.purchasePrice} onChange={onChange} placeholder="0.00" />
            </div>
            <div>
              <div className="label">Base Currency</div>
              <select className="input" name="baseCurrency" value={form.baseCurrency} onChange={onChange}>
                <option value="AED">AED</option>
                <option value="OMR">OMR</option>
                <option value="SAR">SAR</option>
                <option value="BHD">BHD</option>
              </select>
            </div>
            <div>
              <div className="label">Category</div>
              <select className="input" name="category" value={form.category} onChange={onChange}>
                <option value="Skincare">Skincare</option>
                <option value="Haircare">Haircare</option>
                <option value="Bodycare">Bodycare</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap:12}}>
            <div>
              <div className="label">Made In</div>
              <select className="input" name="madeInCountry" value={form.madeInCountry} onChange={onChange}>
                <option value="">-- Select Country --</option>
                {worldCountries.map(c => (
                  <option key={c.code} value={c.name}>{c.flag} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="label">In Stock</div>
              <label style={{display:'inline-flex', alignItems:'center', gap:8}}>
                <input type="checkbox" name="inStock" checked={form.inStock} onChange={onChange} /> Product In Stock
              </label>
            </div>
          </div>
          <div>
            <div className="label">Availability Countries</div>
            <div style={{display:'flex', gap:12, flexWrap:'wrap'}}>
              {COUNTRY_OPTS.map(c => (
                <label key={c.key} className="badge" style={{display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer'}}>
                  <input type="checkbox" checked={form.availableCountries.includes(c.name)} onChange={()=>toggleCountry(c.name)} /> {c.flag} {c.name}
                </label>
              ))}
            </div>
          </div>
          {form.availableCountries.length > 0 && (
            <div>
              <div className="label">Stock by Selected Countries</div>
              <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap:12}}>
                {form.availableCountries.includes('UAE') && (
                  <div>
                    <div className="label" style={{opacity:0.8}}>UAE</div>
                    <input className="input" type="number" min="0" name="stockUAE" value={form.stockUAE} onChange={onChange} />
                  </div>
                )}
                {form.availableCountries.includes('Oman') && (
                  <div>
                    <div className="label" style={{opacity:0.8}}>Oman</div>
                    <input className="input" type="number" min="0" name="stockOman" value={form.stockOman} onChange={onChange} />
                  </div>
                )}
                {form.availableCountries.includes('KSA') && (
                  <div>
                    <div className="label" style={{opacity:0.8}}>KSA</div>
                    <input className="input" type="number" min="0" name="stockKSA" value={form.stockKSA} onChange={onChange} />
                  </div>
                )}
                {form.availableCountries.includes('Bahrain') && (
                  <div>
                    <div className="label" style={{opacity:0.8}}>Bahrain</div>
                    <input className="input" type="number" min="0" name="stockBahrain" value={form.stockBahrain} onChange={onChange} />
                  </div>
                )}
              </div>
            </div>
          )}
          <div>
            <div className="label">Description</div>
            <textarea className="input" name="description" value={form.description} onChange={onChange} placeholder="Describe the product" rows={3} />
          </div>
          <div>
            <div className="label">Images</div>
            <input className="input" type="file" accept="image/*" multiple onChange={onChange} />
            {imagePreviews.length > 0 && (
              <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
                {imagePreviews.map((p,i)=>(
                  <img key={i} src={p.url} alt={p.name} style={{height:64, width:64, objectFit:'cover', borderRadius:6, border:'1px solid var(--border)'}} />
                ))}
              </div>
            )}
          </div>
          <div style={{display:'flex', justifyContent:'flex-end'}}>
            <button className="btn" type="submit" disabled={saving}>{saving? 'Saving...' : 'Create Product'}</button>
          </div>
          {msg && <div style={{opacity:0.9}}>{msg}</div>}
        </form>
      </div>
      )}

      {stockPopup.open && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'grid', placeItems:'center', zIndex:120}}>
          <div className="card" style={{width:'min(92vw, 560px)'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div style={{fontWeight:700}}>Edit Stock by Country</div>
              <button className="btn" onClick={()=>setStockPopup({ open:false, product:null, stockUAE:0, stockOman:0, stockKSA:0, stockBahrain:0, inStock:true })}>Close</button>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12}}>
              <label className="field">
                <div>UAE</div>
                <input type="number" value={stockPopup.stockUAE} min={0} onChange={e=>setStockPopup(s=>({...s, stockUAE: Number(e.target.value||0)}))} />
              </label>
              <label className="field">
                <div>Oman</div>
                <input type="number" value={stockPopup.stockOman} min={0} onChange={e=>setStockPopup(s=>({...s, stockOman: Number(e.target.value||0)}))} />
              </label>
              <label className="field">
                <div>KSA</div>
                <input type="number" value={stockPopup.stockKSA} min={0} onChange={e=>setStockPopup(s=>({...s, stockKSA: Number(e.target.value||0)}))} />
              </label>
              <label className="field">
                <div>Bahrain</div>
                <input type="number" value={stockPopup.stockBahrain} min={0} onChange={e=>setStockPopup(s=>({...s, stockBahrain: Number(e.target.value||0)}))} />
              </label>
              <label style={{gridColumn:'1 / -1', display:'flex', alignItems:'center', gap:8}}>
                <input type="checkbox" checked={stockPopup.inStock} onChange={e=>setStockPopup(s=>({...s, inStock: e.target.checked}))} />
                <span>Product In Stock</span>
              </label>
            </div>
            <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:12}}>
              <button className="btn secondary" onClick={()=>setStockPopup({ open:false, product:null, stockUAE:0, stockOman:0, stockKSA:0, stockBahrain:0, inStock:true })}>Cancel</button>
              <button className="btn" onClick={saveStockPopup}>Save</button>
            </div>
          </div>
        </div>
      )}

      {pricePopup.open && (
        <div style={{position:'fixed', inset:0, zIndex:130}} onClick={()=>setPricePopup({ open:false, product:null, baseCurrency:'SAR', price:'', purchasePrice:'', x:0, y:0 })}>
          <div
            className="card"
            onClick={e=>e.stopPropagation()}
            style={{
              position:'absolute',
              left: Math.max(8, Math.min(pricePopup.x, window.innerWidth - 320)),
              top: Math.max(8, Math.min(pricePopup.y, window.innerHeight - 240)),
              width: 300,
              boxShadow:'0 8px 24px rgba(0,0,0,0.35)'
            }}
          >
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div style={{fontWeight:700}}>Edit Prices</div>
              <button className="btn" onClick={()=>setPricePopup({ open:false, product:null, baseCurrency:'SAR', price:'', purchasePrice:'', x:0, y:0 })}>Close</button>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr', gap:10, marginTop:10}}>
              <label className="field">
                <div>Base Currency</div>
                <select value={pricePopup.baseCurrency} onChange={e=>setPricePopup(p=>({...p, baseCurrency: e.target.value}))}>
                  {['AED','OMR','SAR','BHD'].map(c => (<option key={c} value={c}>{c}</option>))}
                </select>
              </label>
              <label className="field">
                <div>Price</div>
                <input type="number" step="0.01" value={pricePopup.price} onChange={e=>setPricePopup(p=>({...p, price: e.target.value}))} />
              </label>
              <label className="field">
                <div>Purchase Price</div>
                <input type="number" step="0.01" value={pricePopup.purchasePrice} onChange={e=>setPricePopup(p=>({...p, purchasePrice: e.target.value}))} />
              </label>
            </div>
            <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:12}}>
              <button className="btn secondary" onClick={()=>setPricePopup({ open:false, product:null, baseCurrency:'SAR', price:'', purchasePrice:'', x:0, y:0 })}>Cancel</button>
              <button className="btn" onClick={savePricePopup}>Save</button>
            </div>
          </div>
        </div>
      )}

      {gallery.open && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', display:'grid', placeItems:'center', zIndex:110}}>
          <div style={{position:'relative', width:'min(96vw, 1000px)', height:'min(90vh, 720px)', display:'grid', gridTemplateRows:'auto 1fr auto', gap:8}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', color:'#fff'}}>
              <div>Images {gallery.index+1} / {gallery.images.length}</div>
              <div style={{display:'flex', gap:8}}>
                <button className="btn secondary" onClick={resetZoom}>Reset</button>
                <button className="btn secondary" onClick={zoomOut}>-</button>
                <button className="btn secondary" onClick={zoomIn}>+</button>
                <button className="btn" onClick={closeGallery}>Close</button>
              </div>
            </div>
            <div style={{position:'relative', overflow:'hidden', display:'grid', placeItems:'center', background:'#000', borderRadius:8, padding:12}}>
              <img
                src={`${API_BASE}${gallery.images[gallery.index]}`}
                alt={`img-${gallery.index}`}
                style={{
                  width:'auto',
                  height:'auto',
                  maxWidth:'95%',
                  maxHeight:'95%',
                  transform:`scale(${gallery.zoom})`,
                  transformOrigin:'center center',
                  transition:'transform 120ms ease'
                }}
              />
              <button aria-label="Prev" onClick={prevImg} style={{position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', background:'rgba(255,255,255,0.1)', color:'#fff', border:'1px solid #333', borderRadius:6, padding:'8px 10px', cursor:'pointer'}}>{'‹'}</button>
              <button aria-label="Next" onClick={nextImg} style={{position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'rgba(255,255,255,0.1)', color:'#fff', border:'1px solid #333', borderRadius:6, padding:'8px 10px', cursor:'pointer'}}>{'›'}</button>
            </div>
            <div style={{display:'flex', gap:6, overflowX:'auto'}}>
              {gallery.images.map((g, i) => (
                <img key={i} onClick={()=>setGallery(x=>({...x, index:i, zoom:1}))} src={`${API_BASE}${g}`} alt={`thumb-${i}`} style={{height:48, width:48, objectFit:'cover', borderRadius:6, border: i===gallery.index ? `2px solid var(--wa-accent)` : '1px solid var(--border)', cursor:'pointer'}} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div id="products-list" className="card" style={{marginTop:12}}>
        <div className="page-header">
          <div>
            <div className="page-title gradient heading-green">Inhouse Products</div>
          </div>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <input className="input" placeholder="Search by name, category, country" value={query} onChange={e=>setQuery(e.target.value)} style={{maxWidth:320}} />
          </div>
        </div>
        <div style={{overflow:'auto', marginTop:8}}>
          <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0}}>
            <thead>
              <tr>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Image</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Name</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Price (AED/OMR/SAR/BHD)</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Category</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Purchase Price (AED/OMR/SAR/BHD)</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Made In</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Available In</th>
                <th style={{textAlign:'left', padding:'10px 12px'}}>Stock</th>
                {canManage && <th style={{textAlign:'left', padding:'10px 12px'}}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{padding:'10px 12px', opacity:0.7}}>Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} style={{padding:'10px 12px', opacity:0.7}}>No products</td></tr>
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
                        <div style={{position:'relative', width:48, height:48}}>
                          <img onClick={()=>openGallery(imgs,0)} src={`${API_BASE}${first}`} alt={p.name} style={{height:48, width:48, objectFit:'cover', borderRadius:6, cursor:'zoom-in'}} />
                          {imgs.length > 1 && (
                            <button onClick={()=>openGallery(imgs,0)} title={`+${imgs.length-1} more`} style={{position:'absolute', right:-6, bottom:-6, transform:'translate(0,0)', background:'var(--panel-2)', color:'var(--fg)', border:'1px solid var(--border)', borderRadius:12, padding:'2px 6px', fontSize:12, cursor:'pointer'}}>+{imgs.length-1}</button>
                          )}
                        </div>
                      )
                    })()}
                  </td>
                  <td style={{padding:'10px 12px'}}>{p.name}</td>
                  <td style={{padding:'10px 12px', cursor:'pointer'}} onClick={(e)=>openPricePopup(e, p)} title="Edit price">
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
                            <span key={cc} className="badge">{cc} {convertPrice(p.price, p.baseCurrency||'SAR', cc).toFixed(2)}</span>
                          ))}
                        </div>
                      )
                    })()}
                  </td>
                  <td style={{padding:'10px 12px'}}>{p.category||'-'}</td>
                  <td style={{padding:'10px 12px', cursor:'pointer'}} onClick={(e)=>openPricePopup(e, p)} title="Edit purchase price">
                    {p.purchasePrice ? (
                      (()=>{
                        const COUNTRY_TO_CCY = { UAE:'AED', Oman:'OMR', KSA:'SAR', Bahrain:'BHD' }
                        const av = (p.availableCountries||[])
                          .map(c => COUNTRY_TO_CCY[c])
                          .filter(Boolean)
                        const uniq = Array.from(new Set(av))
                        const show = uniq.length > 0 ? uniq : ['AED','OMR','SAR','BHD']
                        return (
                          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                            {show.map(cc => (
                              <span key={cc} className="badge">{cc} {convertPrice(p.purchasePrice, p.baseCurrency||'SAR', cc).toFixed(2)}</span>
                            ))}
                          </div>
                        )
                      })()
                    ) : '-'}
                  </td>
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
                  <td style={{padding:'10px 12px', cursor:'pointer'}} onClick={()=>openStockPopup(p)} title="Edit stock by country">
                    {p.inStock ? (
                      <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                        <span className="badge success">In Stock</span>
                        {[
                          { k:'UAE', v: p.stockByCountry?.UAE ?? 0 },
                          { k:'Oman', v: p.stockByCountry?.Oman ?? 0 },
                          { k:'KSA', v: p.stockByCountry?.KSA ?? 0 },
                          { k:'Bahrain', v: p.stockByCountry?.Bahrain ?? 0 },
                        ].filter(x => Number(x.v) > 0).map(x => (
                          <span key={x.k} className="badge">{x.k}: {x.v}</span>
                        ))}
                      </div>
                    ) : <span className="badge danger">Out of Stock</span>}
                  </td>
                  {canManage && (
                  <td style={{padding:'10px 12px', display:'flex', gap:8}}>
                    <button className="btn secondary" onClick={()=>openEdit(p)} title="Edit" aria-label="Edit" style={{width:36,height:36,padding:0,display:'grid',placeItems:'center'}}>✏️</button>
                    <button className="btn danger" onClick={()=>onDelete(p._id)} title="Delete" aria-label="Delete" style={{width:36,height:36,padding:0,display:'grid',placeItems:'center'}}>🗑️</button>
                  </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && editForm && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'grid', placeItems:'center', zIndex:100}}>
          <div className="card" style={{width:'min(900px, 96vw)', maxHeight:'90vh', overflow:'auto', display:'grid', gap:12}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div style={{fontWeight:700}}>Edit Product</div>
              <button className="btn secondary" onClick={()=>{ setEditing(null); setEditForm(null); setEditPreviews([]) }}>Close</button>
            </div>
            <div style={{display:'grid', gap:12}}>
              <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr 1fr', gap:12}}>
                <div>
                  <div className="label">Name</div>
                  <input className="input" name="name" value={editForm.name} onChange={onEditChange} />
                </div>
                <div>
                  <div className="label">Price</div>
                  <input className="input" type="number" min="0" step="0.01" name="price" value={editForm.price} onChange={onEditChange} />
                </div>
                <div>
                  <div className="label">Purchase Price</div>
                  <input className="input" type="number" min="0" step="0.01" name="purchasePrice" value={editForm.purchasePrice} onChange={onEditChange} />
                </div>
                <div>
                  <div className="label">Base Currency</div>
                  <select className="input" name="baseCurrency" value={editForm.baseCurrency} onChange={onEditChange}>
                    <option value="AED">AED</option>
                    <option value="OMR">OMR</option>
                    <option value="SAR">SAR</option>
                    <option value="BHD">BHD</option>
                  </select>
                </div>
                <div>
                  <div className="label">Category</div>
                  <select className="input" name="category" value={editForm.category} onChange={onEditChange}>
                    <option value="Skincare">Skincare</option>
                    <option value="Haircare">Haircare</option>
                    <option value="Bodycare">Bodycare</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap:12}}>
                <div>
                  <div className="label">Made In</div>
                  <select className="input" name="madeInCountry" value={editForm.madeInCountry} onChange={onEditChange}>
                    <option value="">-- Select Country --</option>
                    {worldCountries.map(c => (
                      <option key={c.code} value={c.name}>{c.flag} {c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="label">In Stock</div>
                  <label style={{display:'inline-flex', alignItems:'center', gap:8}}>
                    <input type="checkbox" name="inStock" checked={editForm.inStock} onChange={onEditChange} /> Product In Stock
                  </label>
                </div>
              </div>
              {(editForm.availableCountries||[]).length > 0 && (
                <div>
                  <div className="label">Stock by Selected Countries</div>
                  <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap:12}}>
                    {editForm.availableCountries.includes('UAE') && (
                      <div>
                        <div className="label" style={{opacity:0.8}}>UAE</div>
                        <input className="input" type="number" min="0" name="stockUAE" value={editForm.stockUAE} onChange={onEditChange} />
                      </div>
                    )}
                    {editForm.availableCountries.includes('Oman') && (
                      <div>
                        <div className="label" style={{opacity:0.8}}>Oman</div>
                        <input className="input" type="number" min="0" name="stockOman" value={editForm.stockOman} onChange={onEditChange} />
                      </div>
                    )}
                    {editForm.availableCountries.includes('KSA') && (
                      <div>
                        <div className="label" style={{opacity:0.8}}>KSA</div>
                        <input className="input" type="number" min="0" name="stockKSA" value={editForm.stockKSA} onChange={onEditChange} />
                      </div>
                    )}
                    {editForm.availableCountries.includes('Bahrain') && (
                      <div>
                        <div className="label" style={{opacity:0.8}}>Bahrain</div>
                        <input className="input" type="number" min="0" name="stockBahrain" value={editForm.stockBahrain} onChange={onEditChange} />
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div>
                <div className="label">Availability Countries</div>
                <div style={{display:'flex', gap:12, flexWrap:'wrap'}}>
                  {COUNTRY_OPTS.map(c => {
                    const checked = (editForm.availableCountries||[]).includes(c.name)
                    return (
                      <label key={c.key} className="badge" style={{display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer'}}>
                        <input type="checkbox" checked={checked} onChange={()=> setEditForm(f=> ({...f, availableCountries: checked ? f.availableCountries.filter(x=>x!==c.name) : [...f.availableCountries, c.name] }))} /> {c.flag} {c.name}
                      </label>
                    )
                  })}
                </div>
              </div>
              <div>
                <div className="label">Description</div>
                <textarea className="input" name="description" value={editForm.description} onChange={onEditChange} rows={3} />
              </div>
              <div>
                <div className="label">Replace Images</div>
                <input className="input" type="file" accept="image/*" multiple onChange={onEditChange} name="images" />
                {editPreviews.length > 0 && (
                  <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
                    {editPreviews.map((p,i)=>(
                      <img key={i} src={p.url} alt={p.name} style={{height:64, width:64, objectFit:'cover', borderRadius:6, border:'1px solid #233'}} />
                    ))}
                  </div>
                )}
              </div>
              <div style={{display:'flex', justifyContent:'flex-end', gap:8}}>
                <button className="btn secondary" onClick={()=>{ setEditing(null); setEditForm(null); setEditPreviews([]) }}>Cancel</button>
                <button className="btn" onClick={onEditSave}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
