import React, { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, NavLink, useNavigate } from 'react-router-dom'
import { API_BASE, apiGet } from '../api.js'

export default function AgentLayout(){
  const [closed, setClosed] = useState(()=> (typeof window!=='undefined' ? window.innerWidth <= 768 : false))
  const location = useLocation()
  const navigate = useNavigate()
  const [isMobile, setIsMobile] = useState(()=> (typeof window!=='undefined' ? window.innerWidth <= 768 : false))
  // Badges state
  const [unreadCount, setUnreadCount] = useState(0)
  const [ordersSubmitted, setOrdersSubmitted] = useState(0)
  const levelThresholds = useMemo(()=> [0,5,50,100,250,500], [])
  const levelIdx = useMemo(()=>{
    const n = Number(ordersSubmitted||0)
    let idx = 0
    for (let i=0;i<levelThresholds.length;i++){ if (n >= levelThresholds[i]) idx = i; else break }
    return idx
  }, [ordersSubmitted, levelThresholds])
  const [theme, setTheme] = useState(()=>{
    try{
      return localStorage.getItem('theme') || 'dark'
    }catch{ return 'dark' }
  })
  useEffect(()=>{
    try{ localStorage.setItem('theme', theme) }catch{}
    const root = document.documentElement
    if (theme === 'light') root.setAttribute('data-theme','light')
    else root.removeAttribute('data-theme')
    setTheme(theme)
  },[theme])
  useEffect(()=>{
    function onResize(){ setIsMobile(window.innerWidth <= 768) }
    window.addEventListener('resize', onResize)
    return ()=> window.removeEventListener('resize', onResize)
  },[])

  // Badges: unread inbox and orders submitted (for level & badge)
  useEffect(()=>{
    let alive = true
    async function refresh(){
      try{
        const chats = await apiGet('/api/wa/chats')
        if (!alive) return
        const sum = Array.isArray(chats) ? chats.reduce((acc,c)=>{
          const mc = (typeof c.unreadCount === 'number' ? c.unreadCount : (c.unread ? 1 : 0))
          return acc + (mc||0)
        }, 0) : 0
        setUnreadCount(sum)
      }catch{}
      try{
        const perf = await apiGet('/api/users/agents/me/performance')
        if (!alive) return
        setOrdersSubmitted(Number(perf?.ordersSubmitted||0))
      }catch{}
    }
    refresh()
    const onFocus = ()=> refresh()
    window.addEventListener('focus', onFocus)
    const id = setInterval(refresh, 30000)
    return ()=>{ alive=false; window.removeEventListener('focus', onFocus); clearInterval(id) }
  }, [])
  const me = JSON.parse(localStorage.getItem('me') || '{}')
  const [showWelcome, setShowWelcome] = useState(true)
  useEffect(()=>{
    const t = setTimeout(()=> setShowWelcome(false), 10000)
    return ()=> clearTimeout(t)
  },[])
  const links = [
    { to: '/agent', label: 'Dashboard' },
    { to: '/agent/inbox/whatsapp', label: 'WhatsApp Inbox' },
    { to: '/agent/quick-replies', label: 'Quick Replies' },
    { to: '/agent/orders', label: 'Submit Orders' },
    { to: '/agent/inhouse-products', label: 'Inhouse Products' },
    { to: '/agent/support', label: 'Support' },
  ]

  // Branding for header logo
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

  const mobileTabs = [
    { to: '/agent', label: 'Dashboard', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { to: '/agent/inbox/whatsapp', label: 'Inbox', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
    { to: '/agent/orders', label: 'Orders', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
    { to: '/agent/inhouse-products', label: 'Products', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> },
    { to: '/agent/me', label: 'Me', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  ]

  // On mobile, the bottom tabs are always visible, and the sidebar is always hidden.
  const tabsVisible = isMobile
  const hideSidebar = isMobile

  useEffect(()=>{
    let startX = 0, startY = 0, startTime = 0, tracking = false
    function onTouchStart(e){
      if (!e.touches || e.touches.length !== 1) return
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : ''
      if (['input','textarea','button','select'].includes(tag)) return
      const t = e.touches[0]
      startX = t.clientX; startY = t.clientY; startTime = Date.now(); tracking = true
    }
    function onTouchEnd(e){
      if (!tracking) return; tracking = false
      const t = (e.changedTouches && e.changedTouches[0]) || null
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      const dt = Date.now() - startTime
      const isHorizontal = Math.abs(dx) > 40 && Math.abs(dy) < 50
      const isQuick = dt < 500
      const fromEdge = startX <= 40 // left-edge gesture
      const isMobile = window.innerWidth <= 768
      if (!isMobile || !isHorizontal || !isQuick) return
      if (dx > 40 && fromEdge){ setClosed(false) }
      else if (dx < -40){ setClosed(true) }
    }
    window.addEventListener('touchstart', onTouchStart, { passive:true })
    window.addEventListener('touchend', onTouchEnd, { passive:true })
    return ()=>{
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  },[])
  // Swipe-back on inner pages (hide tabs): left-edge swipe right triggers history back
  useEffect(()=>{
    if (!isMobile) return
    if (tabsVisible) return
    let sx=0, sy=0, started=false
    function ts(e){ if(!e.touches) return; const t=e.touches[0]; sx=t.clientX; sy=t.clientY; started = sx<=24 }
    function te(e){ if(!started) return; const t=(e.changedTouches&&e.changedTouches[0])||null; if(!t) return; const dx=t.clientX - sx; const dy=t.clientY - sy; if(Math.abs(dy)<60 && dx>60){ navigate(-1) } }
    window.addEventListener('touchstart', ts, { passive:true })
    window.addEventListener('touchend', te, { passive:true })
    return ()=>{ window.removeEventListener('touchstart', ts); window.removeEventListener('touchend', te) }
  },[isMobile, tabsVisible])

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
      const root = document.documentElement
      if (__theme === 'light') root.setAttribute('data-theme','light')
      else root.removeAttribute('data-theme')
      setTheme(__theme)
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

  function doLogout(){
    try{
      localStorage.removeItem('token')
      localStorage.removeItem('me')
      localStorage.removeItem('navColors')
    }catch{}
    try{ navigate('/login', { replace: true }) }catch{}
    setTimeout(()=>{ try{ window.location.assign('/login') }catch{} }, 30)
  }

  return (
    <div>
      <div className={`main ${hideSidebar ? 'full-mobile' : (closed ? 'full' : '')} ${tabsVisible ? 'with-mobile-tabs' : ''}`}>
        {/* Hide heavy layout topbar on mobile for a cleaner look */}
        {!isMobile && (
        <div className="topbar" style={{background:'var(--sidebar-bg)', borderBottom:'1px solid var(--sidebar-border)'}}>
          <div style={{display:'flex', alignItems:'center', gap:12, minHeight:48}}>
            {/* Back on inner pages; hamburger on root */}
            {isMobile && !tabsVisible ? (
              <button className="btn secondary" onClick={()=> navigate(-1)} title="Back" aria-label="Back" style={{ width:36, height:36, padding:0, display:'grid', placeItems:'center' }}>←</button>
            ) : (
              <button
                className="btn secondary"
                onClick={()=> setClosed(c=>!c)}
                title={closed ? 'Open menu' : 'Close menu'}
                aria-label={closed ? 'Open menu' : 'Close menu'}
                style={{ width:36, height:36, padding:0, display:'grid', placeItems:'center' }}
              >
                ☰
              </button>
            )}
            {(()=>{
              const fallback = `${import.meta.env.BASE_URL}BuySial2.png`
              const src = branding.headerLogo ? `${API_BASE}${branding.headerLogo}` : fallback
              return <img src={src} alt="BuySial" style={{height:28, width:'auto', objectFit:'contain'}} />
            })()}
            {/* After overlay hides, keep a compact welcome chip in the header */}
            {!showWelcome && !isMobile && (
              <div
                style={{
                  display:'inline-flex',
                  alignItems:'center',
                  gap:8,
                  padding:'8px 12px',
                  borderRadius:999,
                  background:'var(--panel)',
                  border:'1px solid var(--border)',
                  boxShadow:'0 1px 0 rgba(0,0,0,0.15) inset',
                }}
              >
                <span aria-hidden style={{display:'inline-flex', alignItems:'center', color:'var(--muted)'}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/>
                    <circle cx="10" cy="7" r="3"/>
                  </svg>
                </span>
                <span style={{fontWeight:800, letterSpacing:0.3}}>
                  {`Welcome ${me.firstName||''} ${me.lastName||''}`.trim()}
                </span>
              </div>
            )}
          </div>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            {/* Swatches left of theme toggle */}
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
            <button className="btn secondary" onClick={()=> setTheme(t=> t==='light' ? 'dark' : 'light')} title="Toggle theme">
              {theme==='light' ? '🌙 Dark' : '🌞 Light'}
            </button>
            <button type="button" className="btn danger" onClick={doLogout}>
              Logout
            </button>
          </div>
        </div>
        )}
        <div className={`container ${location.pathname.includes('/inbox/whatsapp') ? 'edge-to-edge' : ''}`}>
          <Outlet />
        </div>
      </div>
      {/* Mobile bottom tabs (root only) */}
      {tabsVisible && (
        <nav className="mobile-tabs" role="navigation" aria-label="Primary">
          {mobileTabs.map(tab => {
            const isInbox = tab.to.includes('/inbox/whatsapp')
            const isOrders = tab.to.endsWith('/orders')
            const isMe = tab.to.endsWith('/me')
            const count = isInbox ? unreadCount : (isOrders ? ordersSubmitted : 0)
            const showCount = isInbox && count > 0
            // Show level badge only when levelIdx > 0
            const meBadge = (isMe && levelIdx > 0) ? `Lv ${levelIdx}` : ''
            return (
              <NavLink key={tab.to} to={tab.to} end={tab.to === '/agent'} className={({isActive})=>`tab ${isActive?'active':''}`}>
                <span className="icon" style={{position:'relative'}}>
                  {tab.icon}
                  {showCount && (
                    <span className="badge" style={{position:'absolute', top:-4, right:-10, fontSize:10, padding:'0 6px', borderRadius:999}}>{count > 99 ? '99+' : count}</span>
                  )}
                </span>
                <span style={{fontSize:11}}>{tab.label}</span>
                {isOrders && count>0 && (
                  <span className="badge" style={{marginLeft:6, fontSize:10}}>{count > 99 ? '99+' : count}</span>
                )}
                {isMe && meBadge && (
                  <span className="badge" style={{marginLeft:6, fontSize:10}}>{meBadge}</span>
                )}
              </NavLink>
            )
          })}
        </nav>
      )}
      {showWelcome && (
        <div className="agent-welcome-overlay" role="status" aria-live="polite">
          <AgentWelcome name={`${me.firstName||''} ${me.lastName||''}`.trim()} />
        </div>
      )}
    </div>
  )
}

function AgentWelcome({ name }){
  return (
    <div className="agent-welcome" aria-live="polite">
      <div className="night" aria-hidden>
        <div className="flowers">
          <div className="flower flower--1">
            <div className="flower__leafs flower__leafs--1">
              <div className="flower__leaf flower__leaf--1"></div>
              <div className="flower__leaf flower__leaf--2"></div>
              <div className="flower__leaf flower__leaf--3"></div>
              <div className="flower__leaf flower__leaf--4"></div>
              <div className="flower__white-circle"></div>
              <div className="flower__light flower__light--1"></div>
              <div className="flower__light flower__light--2"></div>
              <div className="flower__light flower__light--3"></div>
              <div className="flower__light flower__light--4"></div>
              <div className="flower__light flower__light--5"></div>
              <div className="flower__light flower__light--6"></div>
              <div className="flower__light flower__light--7"></div>
            </div>
          </div>
        </div>
      </div>
      <div className="agent-welcome__text">Welcome {name || 'Agent'} ✨</div>
    </div>
  )
}
