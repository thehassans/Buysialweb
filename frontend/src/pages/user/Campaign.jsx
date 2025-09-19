import React, { useMemo, useState } from 'react'
import Modal from '../../components/Modal.jsx'

export default function Campaign(){
  const defaults = useMemo(()=>({
    title: '',
    objective: 'sales', // awareness, traffic, engagement, leads, app_promotion, sales
    buyingType: 'auction',
    budgetStrategy: 'campaign', // campaign | adset
    budgetMode: 'daily', // daily | lifetime
    currency: 'PKR',
    dailyBudget: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    area: 'Pakistan',
    placements: 'advantage+',
    primaryText: '',
    headline: '',
    description: '',
    cta: 'LEARN_MORE',
    format: 'single', // flexible | single | carousel
    adName: '',
    audienceNotes: '',
  }),[])

  const [form, setForm] = useState(defaults)
  const [images, setImages] = useState([]) // File[] (max 5)
  const [videos, setVideos] = useState([]) // File[] (max 5)
  const [msg, setMsg] = useState('')
  const [showAI, setShowAI] = useState(false)
  const [aiPrompt, setAiPrompt] = useState({
    product: '',
    location: 'Pakistan',
    pricing: '',
    target: '',
    usp: '',
  })
  const geminiKey = localStorage.getItem('gemini_api_key') || ''

  function onChange(e){
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  function reset(){ setForm(defaults); setImages([]); setVideos([]) }

  function onPickImages(e){
    const files = Array.from(e.target.files||[]).slice(0,5)
    setImages(files)
  }
  function onPickVideos(e){
    const files = Array.from(e.target.files||[]).slice(0,5)
    setVideos(files)
  }

  function saveDraft(e){
    e.preventDefault()
    try{
      const drafts = JSON.parse(localStorage.getItem('campaignDrafts')||'[]')
      const media = {
        images: images.map(f=>({ name:f.name, size:f.size, type:f.type })),
        videos: videos.map(f=>({ name:f.name, size:f.size, type:f.type })),
      }
      drafts.unshift({ ...form, media, id: Date.now() })
      localStorage.setItem('campaignDrafts', JSON.stringify(drafts.slice(0,50)))
      setMsg('Draft saved locally')
      setTimeout(()=> setMsg(''), 2000)
    }catch{
      setMsg('Failed to save draft')
    }
  }

  async function generateWithAI(){
    setShowAI(false)
    if (!geminiKey){ setMsg('Please add a Gemini API Key in Settings (⚙️)'); return }
    try{
      const prompt = `Generate ad campaign fields in JSON. Fields: title, primaryText, headline, description, cta (LEARN_MORE|SHOP_NOW|SIGN_UP|CONTACT_US), objective (awareness|traffic|engagement|leads|app_promotion|sales), audienceNotes.
Product: ${aiPrompt.product}\nLocation: ${aiPrompt.location}\nPricing: ${aiPrompt.pricing}\nTarget audience: ${aiPrompt.target}\nUnique selling points: ${aiPrompt.usp}\nReturn strictly JSON.`
      const body = {
        contents: [{ parts: [{ text: prompt }]}]
      }
      const res = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`, {
        method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body)
      })
      if(!res.ok){ throw new Error('Gemini request failed') }
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      // Attempt to extract JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      const j = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text)
      setForm(f => ({
        ...f,
        title: j.title || f.title,
        objective: (j.objective||f.objective),
        primaryText: j.primaryText || f.primaryText,
        headline: j.headline || f.headline,
        description: j.description || f.description,
        cta: j.cta || f.cta,
        audienceNotes: j.audienceNotes || f.audienceNotes,
      }))
      setMsg('AI filled campaign details')
      setTimeout(()=> setMsg(''), 2000)
    }catch(e){ setMsg('AI generation failed'); setTimeout(()=> setMsg(''), 2000) }
  }

  return (
    <div className="section" style={{display:'grid', gap:12}}>
      <div className="page-header">
        <div>
          <div className="page-title">Campaigns</div>
          <div className="page-subtitle">Create a campaign similar to Facebook Ads Manager</div>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button className="btn secondary" type="button" onClick={()=> setShowAI(true)}>✨ Generate with AI</button>
          <button className="btn secondary" type="button" onClick={reset}>Reset</button>
          <button className="btn" type="button" onClick={saveDraft}>Save Draft</button>
        </div>
      </div>

      {/* Campaign Setup */}
      <div className="card" style={{display:'grid', gap:12}}>
        <div className="card-title">Campaign details</div>
        <div className="form-grid">
          <div>
            <div className="label">Campaign name</div>
            <input className="input" name="title" value={form.title} onChange={onChange} placeholder="E.g. Summer Sale - PK"/>
          </div>
          <div>
            <div className="label">Buying type</div>
            <select className="input" name="buyingType" value={form.buyingType} onChange={onChange}>
              <option value="auction">Auction</option>
            </select>
          </div>
        </div>
        <div className="form-grid">
          <div>
            <div className="label">Campaign objective</div>
            <select className="input" name="objective" value={form.objective} onChange={onChange}>
              <option value="awareness">Awareness</option>
              <option value="traffic">Traffic</option>
              <option value="engagement">Engagement</option>
              <option value="leads">Leads</option>
              <option value="app_promotion">App promotion</option>
              <option value="sales">Sales</option>
            </select>
          </div>
          <div>
            <div className="label">Target Area / Locations</div>
            <input className="input" name="area" value={form.area} onChange={onChange} placeholder="Pakistan"/>
          </div>
        </div>
      </div>

      {/* Budget & Schedule */}
      <div className="card" style={{display:'grid', gap:12}}>
        <div className="card-title">Budget & schedule</div>
        <div className="form-grid">
          <div>
            <div className="label">Budget strategy</div>
            <select className="input" name="budgetStrategy" value={form.budgetStrategy} onChange={onChange}>
              <option value="campaign">Campaign budget (Advantage+)</option>
              <option value="adset">Ad set budget</option>
            </select>
          </div>
          <div>
            <div className="label">Budget mode</div>
            <select className="input" name="budgetMode" value={form.budgetMode} onChange={onChange}>
              <option value="daily">Daily budget</option>
              <option value="lifetime">Lifetime budget</option>
            </select>
          </div>
        </div>
        <div className="form-grid">
          <div>
            <div className="label">Daily budget</div>
            <div className="input-group">
              <input className="input" name="dailyBudget" value={form.dailyBudget} onChange={onChange} placeholder="2625"/>
              <select className="input" name="currency" value={form.currency} onChange={onChange} style={{maxWidth:140}}>
                <option>PKR</option>
                <option>AED</option>
                <option>USD</option>
              </select>
            </div>
          </div>
          <div>
            <div className="label">Placements</div>
            <select className="input" name="placements" value={form.placements} onChange={onChange}>
              <option value="advantage+">Advantage+ (automatic)</option>
              <option value="manual">Manual</option>
            </select>
          </div>
        </div>
        <div className="form-grid">
          <div>
            <div className="label">Start date & time</div>
            <div className="form-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
              <input className="input" type="date" name="startDate" value={form.startDate} onChange={onChange}/>
              <input className="input" type="time" name="startTime" value={form.startTime} onChange={onChange}/>
            </div>
          </div>
          <div>
            <div className="label">End date & time</div>
            <div className="form-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
              <input className="input" type="date" name="endDate" value={form.endDate} onChange={onChange}/>
              <input className="input" type="time" name="endTime" value={form.endTime} onChange={onChange}/>
            </div>
          </div>
        </div>
      </div>

      {/* Audience notes */}
      <div className="card" style={{display:'grid', gap:12}}>
        <div className="card-title">Audience & notes</div>
        <textarea className="input" rows={3} name="audienceNotes" value={form.audienceNotes} onChange={onChange} placeholder="Describe audience segments, exclusions, or special ad categories (if any)"/>
      </div>

      {/* Ad Creative */}
      <div className="card" style={{display:'grid', gap:12}}>
        <div className="card-title">Ad creative</div>
        <div className="form-grid">
          <div>
            <div className="label">Ad name</div>
            <input className="input" name="adName" value={form.adName} onChange={onChange} placeholder="Ad 1"/>
          </div>
          <div>
            <div className="label">Format</div>
            <select className="input" name="format" value={form.format} onChange={onChange}>
              <option value="flexible">Flexible</option>
              <option value="single">Single image or video</option>
              <option value="carousel">Carousel</option>
            </select>
          </div>
        </div>
        <div>
          <div className="label">Primary Text</div>
          <textarea className="input" name="primaryText" rows={3} value={form.primaryText} onChange={onChange} placeholder="Write the main ad text"/>
        </div>
        <div className="form-grid">
          <div>
            <div className="label">Headline</div>
            <input className="input" name="headline" value={form.headline} onChange={onChange} placeholder="Catchy headline"/>
          </div>
          <div>
            <div className="label">Description</div>
            <input className="input" name="description" value={form.description} onChange={onChange} placeholder="Optional description"/>
          </div>
          <div>
            <div className="label">CTA</div>
            <select className="input" name="cta" value={form.cta} onChange={onChange}>
              <option value="LEARN_MORE">Learn More</option>
              <option value="SHOP_NOW">Shop Now</option>
              <option value="SIGN_UP">Sign Up</option>
              <option value="CONTACT_US">Contact Us</option>
            </select>
          </div>
        </div>
        <div className="form-grid">
          <div>
            <div className="label">Upload Images (up to 5)</div>
            <input className="input" type="file" accept="image/*" multiple onChange={onPickImages} />
            {images.length>0 && (
              <div className="helper">{images.length} image(s) selected</div>
            )}
          </div>
          <div>
            <div className="label">Upload Videos (up to 5)</div>
            <input className="input" type="file" accept="video/*" multiple onChange={onPickVideos} />
            {videos.length>0 && (
              <div className="helper">{videos.length} video(s) selected</div>
            )}
          </div>
        </div>
      </div>

      {/* Drafts */}
      <div className="card" style={{display:'grid', gap:8}}>
        <div className="card-title">Drafts</div>
        <DraftsList />
      </div>

      {msg && <div className="helper" style={{fontWeight:600}}>{msg}</div>}

      {/* AI Modal */}
      <Modal title="Generate with AI" open={showAI} onClose={()=> setShowAI(false)} footer={(
        <>
          <button className="btn secondary" onClick={()=> setShowAI(false)}>Cancel</button>
          <button className="btn" onClick={generateWithAI}>Generate & Fill</button>
        </>
      )}>
        <div style={{display:'grid', gap:10}}>
          <div className="label">About the product</div>
          <textarea className="input" rows={2} value={aiPrompt.product} onChange={e=> setAiPrompt(p=>({ ...p, product: e.target.value }))} placeholder="Describe your product, offering, key features"/>
          <div className="form-grid">
            <div>
              <div className="label">Location</div>
              <input className="input" value={aiPrompt.location} onChange={e=> setAiPrompt(p=>({ ...p, location: e.target.value }))} placeholder="Pakistan, Dubai, UAE, etc."/>
            </div>
            <div>
              <div className="label">Pricing</div>
              <input className="input" value={aiPrompt.pricing} onChange={e=> setAiPrompt(p=>({ ...p, pricing: e.target.value }))} placeholder="E.g. PKR 2,999"/>
            </div>
          </div>
          <div className="form-grid">
            <div>
              <div className="label">Target audience</div>
              <input className="input" value={aiPrompt.target} onChange={e=> setAiPrompt(p=>({ ...p, target: e.target.value }))} placeholder="Who should see this ad?"/>
            </div>
            <div>
              <div className="label">Unique selling points</div>
              <input className="input" value={aiPrompt.usp} onChange={e=> setAiPrompt(p=>({ ...p, usp: e.target.value }))} placeholder="Free delivery, 30-day returns, etc."/>
            </div>
          </div>
          {!geminiKey && (
            <div className="helper">Add your Gemini API Key in Settings (⚙️) to enable AI generation.</div>
          )}
        </div>
      </Modal>
    </div>
  )
}

function DraftsList(){
  const drafts = (()=>{ try{ return JSON.parse(localStorage.getItem('campaignDrafts')||'[]') }catch{ return [] } })()
  if (!drafts.length) return <div style={{opacity:0.7}}>No drafts yet.</div>
  return (
    <div style={{overflow:'auto'}}>
      <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0}}>
        <thead>
          <tr>
            <th style={{textAlign:'left', padding:'10px 12px'}}>Title</th>
            <th style={{textAlign:'left', padding:'10px 12px'}}>Objective</th>
            <th style={{textAlign:'left', padding:'10px 12px'}}>Area</th>
            <th style={{textAlign:'left', padding:'10px 12px'}}>Daily Budget</th>
            <th style={{textAlign:'left', padding:'10px 12px'}}>CTA</th>
          </tr>
        </thead>
        <tbody>
          {drafts.map(d => (
            <tr key={d.id} style={{borderTop:'1px solid var(--border)'}}>
              <td style={{padding:'10px 12px'}}>{d.title}</td>
              <td style={{padding:'10px 12px'}}>{d.objective}</td>
              <td style={{padding:'10px 12px'}}>{d.area||'-'}</td>
              <td style={{padding:'10px 12px'}}>{d.dailyBudget? `${d.dailyBudget} ${d.currency||''}` : '-'}</td>
              <td style={{padding:'10px 12px'}}>{d.cta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
