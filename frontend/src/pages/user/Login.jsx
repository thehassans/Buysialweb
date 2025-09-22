import React, { useEffect, useState } from 'react'
import PasswordInput from '../../components/PasswordInput.jsx'
import { API_BASE, apiGet, apiPost } from '../../api.js'
import { useToast } from '../../ui/Toast.jsx'

export default function UserLogin(){
  const toast = useToast()
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
      const status = e?.status
      const msg = String(e?.message || '')
      if (status === 429){
        toast.info('Too many requests. Please wait a few seconds and try again.')
      } else if (status === 400 || /invalid|incorrect|credentials|password|email/i.test(msg)){
        toast.error('Incorrect email or password')
      } else {
        toast.error(msg || 'Login failed')
      }
    }finally{ setLoading(false) }
  }

  return (
    <div className="min-h-screen grid grid-rows-[auto_1fr] bg-[var(--bg)] text-[var(--fg)]">
      {/* Header bar using same theme as sidebar/header */}
      <div className="header flex items-center justify-center" style={{background:'var(--sidebar-bg)', borderBottom:'1px solid var(--sidebar-border)', padding:'10px 0'}}>
        {/* Brand minimal header */}
      </div>

      {/* Main content */}
      <section className="mx-auto w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-center p-6 md:p-8">
        {/* Left brand/marketing panel (hidden on small screens) */}
        <div className="hidden md:block">
          <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)]">
            <div className="absolute inset-0 pointer-events-none opacity-80"
                 style={{background:
                   'radial-gradient(80% 60% at 50% -10%, rgba(124,58,237,.18), transparent),'+
                   'radial-gradient(45% 35% at 100% 100%, rgba(14,165,233,.15), transparent),'+
                   'radial-gradient(45% 35% at 0% 100%, rgba(34,197,94,.14), transparent)'}}/>
            <div className="relative z-10 p-8 md:p-10 grid gap-4">
              <div className="inline-flex items-center gap-3">
                {(()=>{
                  const fallback = `${import.meta.env.BASE_URL}BuySial2.png`
                  const src = branding.headerLogo ? `${API_BASE}${branding.headerLogo}` : fallback
                  return <img src={src} alt="BuySial" className="h-9 w-auto rounded-md bg-white"/>
                })()}
                <div className="font-extrabold tracking-wide text-lg">BuySial Commerce</div>
              </div>
              <h1 className="text-3xl font-extrabold leading-tight">
                Welcome back
              </h1>
              <p className="text-[var(--muted)]">
                Manage chats, agents and orders from a unified dashboard. Lightning-fast, secure, and built for teams.
              </p>
              <ul className="grid gap-2 mt-2 text-sm">
                <li className="inline-flex items-center gap-2"><span aria-hidden>⚡</span><span>Real-time WhatsApp inbox</span></li>
                <li className="inline-flex items-center gap-2"><span aria-hidden>🛡️</span><span>Role-based access (Admin, User, Manager, Agent, Driver)</span></li>
                <li className="inline-flex items-center gap-2"><span aria-hidden>📈</span><span>Actionable performance insights</span></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Right: sign-in card */}
        <div className="flex items-center justify-center">
          <form onSubmit={login} className="card w-[min(460px,96vw)] grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-[0_20px_60px_rgba(0,0,0,.18)] p-5 md:p-6">
            <div className="grid place-items-center gap-3">
              {(()=>{
                const fallback = `${import.meta.env.BASE_URL}BuySial2.png`
                const src = branding.loginLogo ? `${API_BASE}${branding.loginLogo}` : fallback
                return <img src={src} alt="BuySial" className="w-14 h-14 rounded-xl object-contain bg-white"/>
              })()}
              <div className="page-title gradient heading-brand" style={{ fontSize:26, letterSpacing:'.3px' }}>Sign in</div>
              <div className="helper text-center">Access your dashboard</div>
            </div>

            <div className="grid gap-2 mt-1">
              <label className="label" htmlFor="login-email">Email</label>
              <div className="relative">
                <input id="login-email" className="input pl-9" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@buysial.com" autoComplete="email" required/>
                <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-70" aria-hidden>✉️</span>
              </div>
            </div>
            <div className="grid gap-2">
              <label className="label" htmlFor="login-password">Password</label>
              {/* PasswordInput already includes the show/hide button */}
              <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" id="login-password"/>
              <div className="text-right -mt-1.5">
                <a href="#" onClick={(e)=>{e.preventDefault(); toast.info('Forgot password coming soon') }}>Forgot password?</a>
              </div>
            </div>

            <button className="btn mt-1" disabled={loading}>
              {loading? 'Signing in…' : 'Continue'}
            </button>

            <div className="grid gap-1.5 mt-2">
              {(()=>{
                const dbLabel = String(health.dbLabel||'').toLowerCase()
                const allGood = health.ok && dbLabel === 'connected'
                if (allGood) return null
                const apiLabel = health.ok ? 'ok' : 'down'
                const statusText = `API: ${apiLabel} · DB: ${health.dbLabel || 'unknown'}`
                return (
                  <div className="flex justify-center">
                    <button type="button" className="btn danger" title={statusText} onClick={()=>window.location.reload()}>
                      Connection issue
                    </button>
                  </div>
                )
              })()}
            </div>

            <div className="text-center text-xs text-[var(--muted)] mt-2">
              By continuing, you agree to our Terms and Privacy Policy.
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}
