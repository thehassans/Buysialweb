import React, { useEffect, useRef, useState } from 'react'
import { API_BASE, apiUpload } from '../../api.js'
import { applyBrandingToHead } from '../../util/branding.js'

export default function Branding(){
  const [branding, setBranding] = useState({ headerLogo: null, loginLogo: null, favicon: null, title: '', appName: '' })
  const [headerFile, setHeaderFile] = useState(null)
  const [loginFile, setLoginFile] = useState(null)
  const [faviconFile, setFaviconFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const headerInputRef = useRef(null)
  const loginInputRef = useRef(null)
  const faviconInputRef = useRef(null)
  const [headerPreview, setHeaderPreview] = useState(null)
  const [loginPreview, setLoginPreview] = useState(null)
  const [faviconPreview, setFaviconPreview] = useState(null)
  const [dragHeader, setDragHeader] = useState(false)
  const [dragLogin, setDragLogin] = useState(false)
  const [dragFavicon, setDragFavicon] = useState(false)

  // Revoke object URLs when replaced/unmounted to avoid leaks
  useEffect(()=>{
    return ()=>{ try{ if (headerPreview) URL.revokeObjectURL(headerPreview) }catch{} }
  }, [headerPreview])
  useEffect(()=>{
    return ()=>{ try{ if (loginPreview) URL.revokeObjectURL(loginPreview) }catch{} }
  }, [loginPreview])
  useEffect(()=>{
    return ()=>{ try{ if (faviconPreview) URL.revokeObjectURL(faviconPreview) }catch{} }
  }, [faviconPreview])

  // Live-update: when Title changes, reflect in tab immediately
  useEffect(()=>{
    try{ if (branding.title) applyBrandingToHead({ title: branding.title }) }catch{}
  }, [branding.title])
  // Live-update: when picking a favicon, apply it to head immediately (uses blob: URL)
  useEffect(()=>{
    try{ if (faviconPreview) applyBrandingToHead({ favicon: faviconPreview }) }catch{}
  }, [faviconPreview])

  useEffect(()=>{
    let cancelled = false
    ;(async()=>{
      try{
        const r = await fetch(`${API_BASE}/api/settings/branding`)
        if (!r.ok) return
        const j = await r.json()
        if (!cancelled) setBranding({
          headerLogo: j.headerLogo||null,
          loginLogo: j.loginLogo||null,
          favicon: j.favicon||null,
          title: j.title||'',
          appName: j.appName||''
        })
      }catch{}
    })()
    return ()=>{ cancelled = true }
  },[])

  async function onSave(e){
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try{
      const fd = new FormData()
      if (headerFile) fd.append('header', headerFile)
      if (loginFile) fd.append('login', loginFile)
      if (faviconFile) fd.append('favicon', faviconFile)
      if (branding.title) fd.append('title', branding.title)
      if (branding.appName) fd.append('appName', branding.appName)
      const res = await apiUpload('/api/settings/branding', fd)
      const nextBranding = {
        headerLogo: res.headerLogo||null,
        loginLogo: res.loginLogo||null,
        favicon: res.favicon||null,
        title: res.title||'',
        appName: res.appName||''
      }
      setBranding(nextBranding)
      // Instantly reflect in browser tab / PWA metadata
      try{ applyBrandingToHead({ title: nextBranding.title, appName: nextBranding.appName, favicon: nextBranding.favicon ? `${API_BASE}${nextBranding.favicon}` : null }) }catch{}
      setHeaderFile(null); setLoginFile(null)
      setFaviconFile(null)
      setHeaderPreview(null); setLoginPreview(null); setFaviconPreview(null)
      try{ if (headerInputRef.current) headerInputRef.current.value = '' }catch{}
      try{ if (loginInputRef.current) loginInputRef.current.value = '' }catch{}
      try{ if (faviconInputRef.current) faviconInputRef.current.value = '' }catch{}
      setMsg('Branding updated')
      setTimeout(()=> setMsg(''), 1500)
    }catch(err){ setMsg(err?.message || 'Failed to update') }
    finally{ setSaving(false) }
  }

  const headerSrc = headerPreview || (branding.headerLogo ? `${API_BASE}${branding.headerLogo}` : `${import.meta.env.BASE_URL}BuySial2.png`)
  const loginSrc = loginPreview || (branding.loginLogo ? `${API_BASE}${branding.loginLogo}` : `${import.meta.env.BASE_URL}BuySial2.png`)
  const faviconSrc = faviconPreview || (branding.favicon ? `${API_BASE}${branding.favicon}` : `${import.meta.env.BASE_URL}icons/icon-192.png`)

  function pickFirstImageFile(items){
    if (!items) return null
    // DataTransferItemList or FileList
    const list = Array.from(items)
    for (const it of list){
      const file = it.kind === 'file' ? it.getAsFile?.() : it
      if (!file) continue
      if (file.type && !file.type.startsWith('image/')) continue
      return file
    }
    return null
  }

  return (
    <div className="section" style={{display:'grid', gap:12}}>
      <div className="card" style={{display:'grid', gap:12}}>
        <div className="card-title">Branding</div>
        <div className="card-subtitle">Upload your company logos and set your web app title and favicon (used for PWA install and home screen).</div>
        <form onSubmit={onSave} className="section" style={{display:'grid', gap:12}}>
          <div className="form-grid">
            <div>
              <div className="label">Header/Sidebar Logo</div>
              <div
                onDragOver={(e)=>{ e.preventDefault(); setDragHeader(true) }}
                onDragLeave={()=> setDragHeader(false)}
                onDrop={(e)=>{
                  e.preventDefault(); e.stopPropagation(); setDragHeader(false)
                  const f = pickFirstImageFile(e.dataTransfer?.items || e.dataTransfer?.files)
                  if (f){ setHeaderFile(f); try{ setHeaderPreview(URL.createObjectURL(f)) }catch{} }
                }}
                style={{
                  display:'flex', alignItems:'center', gap:10,
                  padding: dragHeader ? 8 : 0,
                  borderRadius: dragHeader ? 10 : 0,
                  border: dragHeader ? '1px dashed var(--border)' : 'none',
                  background: dragHeader ? 'rgba(37,99,235,.06)' : 'transparent'
                }}
                title="Click or drop an image here"
              >
                <img src={headerSrc} alt="Header Logo" style={{height:48, width:'auto', border:'1px solid var(--border)', borderRadius:8, background:'#fff'}}/>
                <label className="btn secondary" style={{position:'relative', display:'inline-block'}}>
                  Choose file
                  <input
                    ref={headerInputRef}
                    type="file"
                    accept="image/*"
                    style={{ position:'absolute', inset:0, opacity:0, cursor:'pointer' }}
                    onChange={e=>{
                      const f = e.target.files?.[0] || null
                      setHeaderFile(f)
                      if (f){ try{ setHeaderPreview(URL.createObjectURL(f)) }catch{} }
                    }}
                  />
                </label>
                {headerFile && <span className="helper" style={{fontWeight:600}}>{headerFile.name}</span>}
              </div>
              <div className="helper">Shown in the app header and sidebar. Recommended height ~28-64px, transparent background.</div>
            </div>
            <div>
              <div className="label">Login Screen Logo</div>
              <div
                onDragOver={(e)=>{ e.preventDefault(); setDragLogin(true) }}
                onDragLeave={()=> setDragLogin(false)}
                onDrop={(e)=>{
                  e.preventDefault(); e.stopPropagation(); setDragLogin(false)
                  const f = pickFirstImageFile(e.dataTransfer?.items || e.dataTransfer?.files)
                  if (f){ setLoginFile(f); try{ setLoginPreview(URL.createObjectURL(f)) }catch{} }
                }}
                style={{
                  display:'flex', alignItems:'center', gap:10,
                  padding: dragLogin ? 8 : 0,
                  borderRadius: dragLogin ? 10 : 0,
                  border: dragLogin ? '1px dashed var(--border)' : 'none',
                  background: dragLogin ? 'rgba(37,99,235,.06)' : 'transparent'
                }}
                title="Click or drop an image here"
              >
                <img src={loginSrc} alt="Login Logo" style={{height:64, width:64, objectFit:'contain', border:'1px solid var(--border)', borderRadius:8, background:'#fff'}}/>
                <label className="btn secondary" style={{position:'relative', display:'inline-block'}}>
                  Choose file
                  <input
                    ref={loginInputRef}
                    type="file"
                    accept="image/*"
                    style={{ position:'absolute', inset:0, opacity:0, cursor:'pointer' }}
                    onChange={e=>{
                      const f = e.target.files?.[0] || null
                      setLoginFile(f)
                      if (f){ try{ setLoginPreview(URL.createObjectURL(f)) }catch{} }
                    }}
                  />
                </label>
                {loginFile && <span className="helper" style={{fontWeight:600}}>{loginFile.name}</span>}
              </div>
              <div className="helper">Shown on the login card. Recommended size ~64x64 or square.</div>
            </div>
            <div>
              <div className="label">Favicon / App Icon</div>
              <div
                onDragOver={(e)=>{ e.preventDefault(); setDragFavicon(true) }}
                onDragLeave={()=> setDragFavicon(false)}
                onDrop={(e)=>{
                  e.preventDefault(); e.stopPropagation(); setDragFavicon(false)
                  const items = e.dataTransfer?.items || e.dataTransfer?.files
                  const f = (Array.from(items||[])[0]?.getAsFile?.() || Array.from(items||[])[0]) || null
                  if (f){ setFaviconFile(f); try{ setFaviconPreview(URL.createObjectURL(f)) }catch{} }
                }}
                style={{
                  display:'flex', alignItems:'center', gap:10,
                  padding: dragFavicon ? 8 : 0,
                  borderRadius: dragFavicon ? 10 : 0,
                  border: dragFavicon ? '1px dashed var(--border)' : 'none',
                  background: dragFavicon ? 'rgba(37,99,235,.06)' : 'transparent'
                }}
                title="Click or drop an image here"
              >
                <img src={faviconSrc} alt="Favicon" style={{height:48, width:48, objectFit:'contain', border:'1px solid var(--border)', borderRadius:8, background:'#fff'}}/>
                <label className="btn secondary" style={{position:'relative', display:'inline-block'}}>
                  Choose icon
                  <input
                    ref={faviconInputRef}
                    type="file"
                    accept="image/png, image/svg+xml, image/x-icon, .ico, .png, .svg"
                    style={{ position:'absolute', inset:0, opacity:0, cursor:'pointer' }}
                    onChange={e=>{
                      const f = e.target.files?.[0] || null
                      setFaviconFile(f)
                      if (f){ try{ setFaviconPreview(URL.createObjectURL(f)) }catch{} }
                    }}
                  />
                </label>
                {faviconFile && <span className="helper" style={{fontWeight:600}}>{faviconFile.name}</span>}
              </div>
              <div className="helper">Recommended: PNG 512x512 for best install icon quality. iOS will use this for home screen.</div>
            </div>
            <div>
              <div className="label">Website Title</div>
              <input className="input" value={branding.title||''} onChange={e=> setBranding(b=>({...b, title: e.target.value}))} placeholder="e.g. My Company CRM" />
            </div>
            <div>
              <div className="label">App Name (short)</div>
              <input className="input" value={branding.appName||''} onChange={e=> setBranding(b=>({...b, appName: e.target.value}))} placeholder="e.g. MyCRM" />
              <div className="helper">Shown under the home screen icon and in PWA install banners.</div>
            </div>
          </div>
          <div style={{display:'flex', gap:8}}>
            <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Branding'}</button>
            {msg && <div className="helper" style={{fontWeight:600}}>{msg}</div>}
          </div>
        </form>
      </div>
    </div>
  )
}
