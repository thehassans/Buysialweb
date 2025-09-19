import React, { useEffect, useState } from 'react'
import PasswordInput from '../../components/PasswordInput.jsx'
import { API_BASE, apiGet, apiPost } from '../../api.js'

export default function UserLogin(){
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [loading,setLoading]=useState(false)
  const [health, setHealth] = useState({ ok:false, dbLabel:'unknown' })
  const [branding, setBranding] = useState({ headerLogo: null, loginLogo: null })

  // Health check with backoff; stop once healthy
  useEffect(()=>{
    let cancelled = false
    let attempt = 0
    const delays = [3000, 7000, 15000, 30000]
    async function run(){
      try{
        const j = await apiGet('/api/health')
        if (cancelled) return
        const dbLabel = j?.db?.label || 'unknown'
        const ok = j?.status === 'ok'
        setHealth({ ok, dbLabel })
        if (!ok){
          const d = delays[Math.min(attempt, delays.length-1)]
          attempt++
          setTimeout(()=>{ if(!cancelled) run() }, d)
        }
      }catch{
        if (cancelled) return
        setHealth({ ok:false, dbLabel:'unreachable' })
        const d = delays[Math.min(attempt, delays.length-1)]
        attempt++
        setTimeout(()=>{ if(!cancelled) run() }, d)
      }
    }
    run()
    return ()=>{ cancelled = true }
  },[])

  // Load branding (public, no auth needed)
  useEffect(()=>{
    let cancelled = false
    ;(async()=>{
      try{
        const j = await apiGet('/api/settings/branding')
        if (!cancelled) setBranding({ headerLogo: j.headerLogo||null, loginLogo: j.loginLogo||null })
      }catch{ /* ignore */ }
    })()
    return ()=>{ cancelled = true }
  },[])

  async function login(e){
    e.preventDefault()
    setLoading(true)
    try{
      const data = await apiPost('/api/auth/login', { email, password })
      localStorage.setItem('token', data.token)
      localStorage.setItem('me', JSON.stringify(data.user))
      if (data.user.role === 'admin') location.href = '/admin'
      else if (data.user.role === 'agent') location.href = '/agent'
      else if (data.user.role === 'manager') location.href = '/manager'
      else if (data.user.role === 'investor') location.href = '/investor'
      else if (data.user.role === 'driver') location.href = '/driver'
      else location.href = '/user'
    }catch(e){
      const raw = String(e?.message || '')
      if (/(429|Too Many Requests)/i.test(raw)){
        alert('Too many requests. Please wait a few seconds and try again.')
      } else if (/Invalid|failed|HTTP\s*400/i.test(raw)){
        alert('Login failed. Please check your email/password and try again.')
      } else {
        alert('Login failed')
      }
    }finally{ setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100%', display:'grid', gridTemplateRows:'auto 1fr' }}>
      {/* Header bar using same theme as sidebar/header */}
      <div className="header" style={{display:'flex', alignItems:'center', justifyContent:'center', background:'var(--sidebar-bg)', borderBottom:'1px solid var(--sidebar-border)', padding:'10px 0'}}>
        {/* Brand removed per request to keep header clean on login */}
      </div>

      {/* Main content */}
      <div style={{display:'grid', placeItems:'center', padding:'24px'}}>
        <form onSubmit={login} className="card" style={{
          width:'min(420px, 96vw)',
          display:'grid',
          gap:12,
          borderRadius:14,
          border:'1px solid var(--border)',
          background:'var(--panel)',
          backdropFilter:'none',
          boxShadow:'0 20px 60px rgba(0,0,0,.18)'
        }}>
          <div style={{display:'grid', placeItems:'center', gap:8}}>
            {(()=>{
              const fallback = `${import.meta.env.BASE_URL}BuySial2.png`
              const src = branding.loginLogo ? `${API_BASE}${branding.loginLogo}` : fallback
              return <img src={src} alt="BuySial" style={{width:64, height:64, borderRadius:16, objectFit:'contain', background:'#fff'}}/>
            })()}
            <div className="page-title gradient heading-brand" style={{ fontSize:28, letterSpacing:'.3px' }}>Welcome</div>
            <div className="helper" style={{textAlign:'center'}}>Sign in to access your dashboard</div>
          </div>

          <div>
            <div className="label">Email</div>
            <input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@buysial.com" autoComplete="email" required/>
          </div>
          <div>
            <div className="label">Password</div>
            <PasswordInput value={password} onChange={setPassword} autoComplete="current-password"/>
          </div>
          <div style={{textAlign:'right',marginTop:2}}>
            <a href="#" onClick={(e)=>{e.preventDefault(); alert('Forgot password coming soon')}}>Forgot password?</a>
          </div>

          <button className="btn" style={{marginTop:4}} disabled={loading}>
            {loading? 'Signing in…' : 'Login'}
          </button>

          <div style={{marginTop:8, display:'grid', gap:6}}>
            {(()=>{
              const dbLabel = String(health.dbLabel||'').toLowerCase()
              const allGood = health.ok && dbLabel === 'connected'
              if (allGood) return null
              const apiLabel = health.ok ? 'ok' : 'down'
              const statusText = `API: ${apiLabel} · DB: ${health.dbLabel || 'unknown'}`
              return (
                <div style={{display:'flex', justifyContent:'center'}}>
                  <button type="button" className="btn danger" title={statusText} onClick={()=>window.location.reload()}>
                    Connection issue
                  </button>
                </div>
              )
            })()}
          </div>
        </form>
      </div>
    </div>
  )
}
