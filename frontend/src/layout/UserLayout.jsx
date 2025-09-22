import React, { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { API_BASE } from '../api.js'
import Sidebar from '../components/Sidebar.jsx'
import Modal from '../components/Modal.jsx'
import Tabs from '../ui/Tabs.jsx'

export default function UserLayout(){
  const navigate = useNavigate()
  const [closed, setClosed] = useState(()=> (typeof window!=='undefined' ? window.innerWidth <= 768 : false))
  const [isMobile, setIsMobile] = useState(()=> (typeof window!=='undefined' ? window.innerWidth <= 768 : false))
  const [theme, setTheme] = useState('dark')
  const location = useLocation()
  const me = JSON.parse(localStorage.getItem('me') || '{}')
  const links = [
    { to: '/user', label: 'Dashboard', icon: '📊' },
    {
      label: 'Inbox', icon: '💬',
      children: [
        { to: '/user/inbox/whatsapp', label: 'Whatsapp Inbox', icon: '🗨️' },
        { to: '/user/inbox/connect', label: 'Whatsapp Connect', icon: '🔗' },
      ]
    },
    {
      label: 'Create', icon: '➕',
      children: [
        { to: '/user/agents', label: 'Agents', icon: '👥' },
        { to: '/user/managers', label: 'Managers', icon: '🧑‍💼' },
        { to: '/user/investors', label: 'Investors', icon: '💼' },
        { to: '/user/drivers', label: 'Drivers', icon: '🚛' },
      ]
    },
    { to: '/user/campaigns', label: 'Campaigns', icon: '📢' },
    {
      label: 'Commerce', icon: '🛍️',
      children: [
        { to: '/user/orders', label: 'Orders', icon: '🧾' },
        { to: '/user/inhouse-products', label: 'Inhouse Products', icon: '🏷️' },
        { to: '/user/warehouses', label: 'Warehouses', icon: '🏬' },
        { to: '/user/shipments', label: 'Shipments', icon: '🚚' },
        { to: '/user/expense', label: 'Expense Management', icon: '💸' },
        { to: '/user/transactions', label: 'Transactions', icon: '💳' },
      ]
    },
    { label: 'Insights', icon: '📈', children: [ { to: '/user/reports', label: 'Business Reports', icon: '📑' } ] },
    { to: '/user/support', label: 'Support', icon: '🛟' },
  ]

  // Branding (header logo)
  const [branding, setBranding] = useState({ headerLogo: null })
  useEffect(()=>{
    let cancelled = false
    ;(async()=>{
      try{
        const r = await fetch(`${API_BASE}/api/settings/branding`)
        if (!r.ok) return
        const j = await r.json()
        if (!cancelled) setBranding({ headerLogo: j.headerLogo || null })
      }catch{}
    })()
    return ()=>{ cancelled = true }
  },[])

  useEffect(()=>{
    function onResize(){
      const mobile = window.innerWidth <= 768
      setIsMobile(mobile)
      if (mobile) setClosed(true)
    }
    window.addEventListener('resize', onResize)
    return ()=> window.removeEventListener('resize', onResize)
  },[])

  // Initialize theme from localStorage or system preference
  useEffect(()=>{
    const saved = localStorage.getItem('theme')
    let t = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    setTheme(t)
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark')
  },[])

  // Mobile swipe gestures to open/close sidebar
  useEffect(()=>{
    let startX = 0, startY = 0, startTime = 0, tracking = false
    function onTouchStart(e){
      if (!e.touches || e.touches.length !== 1) return
      const t = e.touches[0]
      // ignore starting over inputs/buttons to avoid conflicts
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : ''
      if (['input','textarea','button','select'].includes(tag)) return
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
      if (dx > 40 && fromEdge){
        // swipe right from edge -> open
        setClosed(false)
      }else if (dx < -40){
        // swipe left anywhere -> close
        setClosed(true)
      }
    }
    window.addEventListener('touchstart', onTouchStart, { passive:true })
    window.addEventListener('touchend', onTouchEnd, { passive:true })
    return ()=>{
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  },[])

  // Swatch helpers: apply sidebar/header colors and persist
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

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false)
  const [fbToken, setFbToken] = useState(() => localStorage.getItem('fb_access_token') || '')
  const [fbAppId, setFbAppId] = useState(() => localStorage.getItem('fb_app_id') || '')
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '')
  const [testMsg, setTestMsg] = useState('')

  function toggleTheme(){
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    localStorage.setItem('theme', next)
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : 'dark')
  }

  function doLogout(){
    try{
      localStorage.removeItem('token')
      localStorage.removeItem('me')
      localStorage.removeItem('navColors')
    }catch{}
    try{ navigate('/login', { replace:true }) }catch{}
    setTimeout(()=>{ try{ window.location.assign('/login') }catch{} }, 30)
  }
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <Sidebar closed={closed} links={links} onToggle={()=>setClosed(c=>!c)} />
      <div className={`main ${closed ? 'full' : ''}`}>
        <div className="topbar shadow-sm backdrop-blur supports-[backdrop-filter]:bg-opacity-90" style={{background:'var(--sidebar-bg)', borderBottom:'1px solid var(--sidebar-border)'}}>
          <div style={{display:'flex', alignItems:'center', gap:12}}>
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
            <img src={branding.headerLogo || `${import.meta.env.BASE_URL}BuySial2.png`} alt="BuySial" style={{height:28, width:'auto', objectFit:'contain'}} />
            {!isMobile && (
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
                  {/* User/hand icon */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
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
            {/* Swatches positioned left to the theme toggle */}
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
            <button
              className="btn secondary"
              onClick={toggleTheme}
              title={theme==='light' ? 'Switch to dark mode' : 'Switch to light mode'}
              aria-label={theme==='light' ? 'Dark mode' : 'Light mode'}
              style={{width:36,height:36,padding:0,display:'grid',placeItems:'center'}}
            >
              {theme==='light' ? '🌙' : '☀️'}
            </button>
            {/* Quick access to Agents (Create Agent form lives on this page) */}
            {!isMobile && (
              <button className="btn secondary" onClick={()=> navigate('/user/agents')} title="Agents">Agents</button>
            )}
            {/* Settings gear replaces direct logout */}
            <button className="btn" title="Settings" aria-label="Settings" onClick={()=> setShowSettings(true)} style={{width:36,height:36,padding:0,display:'grid',placeItems:'center'}}>
              ⚙️
            </button>
          </div>
        </div>
        <div className={`container ${location.pathname.includes('/inbox/whatsapp') ? 'edge-to-edge' : ''} ${isMobile ? 'with-mobile-tabs' : ''} max-w-screen-2xl mx-auto px-3 md:px-6`}>
          <Outlet />
        </div>
        {/* Mobile bottom tabs */}
        {isMobile && (
          (()=>{
            const path = location.pathname || ''
            const items = [
              { key:'chats', label:'Chats', icon:'💬', to:'/user/inbox/whatsapp' },
              { key:'agents', label:'Agents', icon:'👥', to:'/user/agents' },
              { key:'orders', label:'Orders', icon:'🧾', to:'/user/orders' },
              { key:'products', label:'Products', icon:'🏷️', to:'/user/inhouse-products' },
              { key:'support', label:'Support', icon:'🛟', to:'/user/support' },
            ]
            const activeKey = (
              path.includes('/inbox/whatsapp') ? 'chats' :
              path.includes('/agents') ? 'agents' :
              path.includes('/orders') ? 'orders' :
              path.includes('/inhouse-products') ? 'products' :
              path.includes('/support') ? 'support' :
              'chats'
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
      {/* Settings Modal */}
      <Modal title="Settings" open={showSettings} onClose={()=>{ setShowSettings(false); setTestMsg('') }} footer={(
        <>
          <button type="button" className="btn secondary" onClick={doLogout}>Logout</button>
          <button className="btn" onClick={()=>{ localStorage.setItem('fb_access_token', fbToken||''); localStorage.setItem('fb_app_id', fbAppId||''); localStorage.setItem('gemini_api_key', geminiKey||''); setTestMsg('Settings saved'); setTimeout(()=> setTestMsg(''), 2000) }}>Save</button>
        </>
      )}>
        <div className="section" style={{display:'grid', gap:16}}>
          <div className="card" style={{display:'grid', gap:10}}>
            <div className="card-title">Facebook API Setup</div>
            <div className="form-grid">
              <div>
                <div className="label">Access Token</div>
                <input className="input" value={fbToken} onChange={e=>setFbToken(e.target.value)} placeholder="EAAB..." />
              </div>
              <div>
                <div className="label">App ID</div>
                <input className="input" value={fbAppId} onChange={e=>setFbAppId(e.target.value)} placeholder="1234567890" />
              </div>
            </div>
            <div style={{display:'flex', gap:8}}>
              <button className="btn secondary" type="button" onClick={async ()=>{
                setTestMsg('Testing Facebook API…')
                try{
                  // Basic check against Graph, may be restricted by CORS but indicates reachability
                  const url = `https://graph.facebook.com/v17.0/me?access_token=${encodeURIComponent(fbToken||'')}`
                  const r = await fetch(url)
                  if (r.ok){ setTestMsg('Facebook API Connection Successful') }
                  else { setTestMsg('Facebook API test failed') }
                }catch{ setTestMsg('Facebook API test failed') }
              }}>Test Connection</button>
            </div>
          </div>

          <div className="card" style={{display:'grid', gap:10}}>
            <div className="card-title">Gemini API Setup</div>
            <div>
              <div className="label">API Key</div>
              <input className="input" value={geminiKey} onChange={e=>setGeminiKey(e.target.value)} placeholder="AIza..." />
            </div>
            <div style={{display:'flex', gap:8}}>
              <button className="btn secondary" type="button" onClick={async ()=>{
                setTestMsg('Testing Gemini API…')
                try{
                  const url = `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(geminiKey||'')}`
                  const r = await fetch(url)
                  if (r.ok){ setTestMsg('Gemini API Connection Successful') }
                  else { setTestMsg('Gemini API test failed') }
                }catch{ setTestMsg('Gemini API test failed') }
              }}>Test Connection</button>
            </div>
          </div>

          {testMsg && <div className="helper" style={{fontWeight:600}}>{testMsg}</div>}
        </div>
      </Modal>
    </div>
  )
}
