import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import Tabs from '../ui/Tabs.jsx'
import { API_BASE } from '../api.js'

export default function AdminLayout(){
  const navigate = useNavigate()
  const location = useLocation()
  const [closed, setClosed] = useState(()=> (typeof window!=='undefined' ? window.innerWidth <= 768 : false))
  const [isMobile, setIsMobile] = useState(()=> (typeof window!=='undefined' ? window.innerWidth <= 768 : false))

  useEffect(()=>{
    function onResize(){
      const mobile = window.innerWidth <= 768
      setIsMobile(mobile)
      if (mobile) setClosed(true)
    }
    window.addEventListener('resize', onResize)
    return ()=> window.removeEventListener('resize', onResize)
  },[])

  // Swatch helpers for header theme controls
  function applyNavColors(cfg){
    if (!cfg) return
    const RESET_KEYS = ['sidebar-bg','sidebar-border','nav-active-bg','nav-active-fg']
    const { __theme, __reset, ...vars } = cfg
    if (__reset || Object.keys(vars).length === 0){
      RESET_KEYS.forEach(k => document.documentElement.style.removeProperty(`--${k}`))
      try{ localStorage.removeItem('navColors') }catch{}
    } else {
      Object.entries(vars).forEach(([k,v])=>{
        document.documentElement.style.setProperty(`--${k}`, v)
      })
      localStorage.setItem('navColors', JSON.stringify(vars))
    }
    if (__theme){
      localStorage.setItem('theme', __theme)
      document.documentElement.setAttribute('data-theme', __theme === 'light' ? 'light' : 'dark')
    }
  }
  const navPresets = [
    { title:'Default', cfg:{ __reset:true }, sample:'linear-gradient(135deg,var(--panel-2),var(--panel))' },
    { title:'Purple',  cfg:{ 'sidebar-bg':'#1a1036', 'sidebar-border':'#2b1856', 'nav-active-bg':'#3f1d67', 'nav-active-fg':'#f5f3ff' }, sample:'#7c3aed' },
    { title:'Green',   cfg:{ 'sidebar-bg':'#06251f', 'sidebar-border':'#0b3b31', 'nav-active-bg':'#0f3f33', 'nav-active-fg':'#c7f9ec' }, sample:'#10b981' },
    { title:'Blue',    cfg:{ 'sidebar-bg':'#0b1220', 'sidebar-border':'#223',    'nav-active-bg':'#1e293b', 'nav-active-fg':'#e2e8f0' }, sample:'#2563eb' },
    { title:'Slate',   cfg:{ 'sidebar-bg':'#0f172a', 'sidebar-border':'#1e293b', 'nav-active-bg':'#1f2937', 'nav-active-fg':'#e5e7eb' }, sample:'#334155' },
    { title:'Orange',  cfg:{ 'sidebar-bg':'#2a1304', 'sidebar-border':'#3b1d08', 'nav-active-bg':'#4a1f0a', 'nav-active-fg':'#ffedd5' }, sample:'#f97316' },
    { title:'Pink',    cfg:{ 'sidebar-bg':'#2a0b17', 'sidebar-border':'#3a0f20', 'nav-active-bg':'#4b1026', 'nav-active-fg':'#ffe4e6' }, sample:'#ec4899' },
    { title:'Light Pink', cfg:{ 'sidebar-bg':'#2b1020', 'sidebar-border':'#3a152b', 'nav-active-bg':'#4b1a36', 'nav-active-fg':'#ffd7ef' }, sample:'#f9a8d4' },
    { title:'Blush',   cfg:{ '__theme':'light', 'sidebar-bg':'#FFB5C0', 'sidebar-border':'#f39bab', 'nav-active-bg':'#ffdfe6', 'nav-active-fg':'#111827' }, sample:'#FFB5C0' },
    { title:'White',   cfg:{ '__theme':'light', 'sidebar-bg':'#ffffff', 'sidebar-border':'#e5e7eb', 'nav-active-bg':'#f1f5f9', 'nav-active-fg':'#111827' }, sample:'#ffffff' },
  ]
  const links = [
    { to: '/admin', label: 'Dashboard' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/inbox/whatsapp', label: 'Whatsapp Inbox' },
    { to: '/admin/inbox/connect', label: 'Whatsapp Connect' },
    { to: '/admin/branding', label: 'Branding' },
  ]
  function doLogout(){
    try{
      localStorage.removeItem('token')
      localStorage.removeItem('me')
      localStorage.removeItem('navColors')
    }catch{}
    try{ navigate('/login', { replace:true }) }catch{}
    setTimeout(()=>{ try{ window.location.assign('/login') }catch{} }, 30)
  }
  const [branding, setBranding] = useState({ headerLogo: null })
  useEffect(()=>{
    let cancelled=false
    ;(async()=>{
      try{
        const r = await fetch(`${API_BASE}/api/settings/branding`)
        if (!r.ok) return
        const j = await r.json()
        if (!cancelled) setBranding({ headerLogo: j.headerLogo || null })
      }catch{}
    })()
    return ()=>{ cancelled=true }
  },[])
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <Sidebar closed={closed} links={links} onToggle={()=>setClosed(c=>!c)} />
      <div className={`main ${closed ? 'full' : ''}`}>
        <div className="topbar shadow-sm backdrop-blur supports-[backdrop-filter]:bg-opacity-90" style={{
          background:'var(--sidebar-bg)',
          borderBottom:'1px solid var(--sidebar-border)',
          position:'sticky', top:0, zIndex:1000,
        }}>
          <div style={{display:'flex', alignItems:'center', gap:12, minHeight:48}}>
            {/* Always-visible hamburger + logo */}
            <button
              className="btn secondary"
              onClick={()=> setClosed(c=>!c)}
              title={closed ? 'Open menu' : 'Close menu'}
              aria-label={closed ? 'Open menu' : 'Close menu'}
              style={{ width:36, height:36, padding:0, display:'grid', placeItems:'center' }}
            >
              ☰
            </button>
            {(()=>{
              const fallback = `${import.meta.env.BASE_URL}BuySial2.png`
              const src = branding.headerLogo ? `${API_BASE}${branding.headerLogo}` : fallback
              return <img src={src} alt="BuySial" style={{height:28, width:'auto', objectFit:'contain'}} />
            })()}
            {!isMobile && (
              <div
                style={{
                  display:'inline-flex',
                  alignItems:'center',
                  gap:6,
                  padding:'6px 10px',
                  borderRadius:999,
                  background:'var(--panel)',
                  border:'1px solid var(--border)',
                  fontWeight:700,
                  letterSpacing:0.2,
                }}
              >
                <span role="img" aria-label="gear">⚙️</span>
                <span>Admin Panel</span>
              </div>
            )}
          </div>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            {/* Swatches left of the buttons */}
            {!isMobile && (
              <div role="group" aria-label="Theme colors" style={{display:'flex', gap:8, alignItems:'center'}}>
                {navPresets.map(p => (
                  <button
                    key={p.title}
                    type="button"
                    title={p.title}
                    aria-label={p.title}
                    onClick={()=> applyNavColors(p.cfg)}
                    style={{ width:18, height:18, borderRadius:999, border:'1px solid rgba(255,255,255,.3)', background:p.sample, cursor:'pointer', boxShadow:'0 1px 2px rgba(0,0,0,.25) inset' }}
                  />
                ))}
              </div>
            )}
            {!isMobile && <NavLink to="/user" className="btn secondary" style={{marginRight:8}}>User Panel</NavLink>}
            <button type="button" className="btn danger" onClick={doLogout}>
              Logout
            </button>
          </div>
        </div>
        <div className={`container ${isMobile ? 'with-mobile-tabs' : ''} max-w-screen-2xl mx-auto px-3 md:px-6`}>
          <Outlet />
        </div>
        {/* Mobile bottom tabs */}
        {isMobile && (
          (()=>{
            const path = location.pathname || ''
            const items = [
              { key:'dashboard', label:'Dashboard', icon:'📊', to:'/admin' },
              { key:'users', label:'Users', icon:'👥', to:'/admin/users' },
              { key:'inbox', label:'Inbox', icon:'💬', to:'/admin/inbox/whatsapp' },
              { key:'connect', label:'Connect', icon:'🔗', to:'/admin/inbox/connect' },
            ]
            const activeKey = (
              path === '/admin' || path.startsWith('/admin$') ? 'dashboard' :
              path.includes('/admin/users') ? 'users' :
              path.includes('/admin/inbox/whatsapp') ? 'inbox' :
              path.includes('/admin/inbox/connect') ? 'connect' :
              'dashboard'
            )
            return (
              <Tabs
                items={items}
                activeKey={activeKey}
                onChange={(k)=>{ const t = items.find(x=>x.key===k); if(t) navigate(t.to) }}
              />
            )
          })()
        )}
      </div>
    </div>
  )
}
