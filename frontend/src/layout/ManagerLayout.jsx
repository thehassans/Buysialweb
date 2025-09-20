import React, { useEffect, useState } from 'react'
import { Outlet, useLocation, NavLink, useNavigate } from 'react-router-dom'
import { API_BASE } from '../api.js'

export default function ManagerLayout(){
  const [closed, setClosed] = useState(()=> (typeof window!=='undefined' ? window.innerWidth <= 768 : false))
  const location = useLocation()
  const navigate = useNavigate()
  const [isMobile, setIsMobile] = useState(()=> (typeof window!=='undefined' ? window.innerWidth <= 768 : false))
  const [theme, setTheme] = useState(()=>{
    try{ return localStorage.getItem('theme') || 'dark' }catch{ return 'dark' }
  })
  useEffect(()=>{
    try{ localStorage.setItem('theme', theme) }catch{}
    const root = document.documentElement
    if (theme === 'light') root.setAttribute('data-theme','light')
    else root.removeAttribute('data-theme')
  },[theme])
  useEffect(()=>{
    function onResize(){ setIsMobile(window.innerWidth <= 768) }
    window.addEventListener('resize', onResize)
    return ()=> window.removeEventListener('resize', onResize)
  },[])

  const me = JSON.parse(localStorage.getItem('me') || '{}')

  const mobileTabs = [
    { to: '/manager', label: 'Dashboard', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { to: '/manager/inbox/whatsapp', label: 'Inbox', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
    { to: '/manager/orders', label: 'Orders', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
    { to: '/manager/drivers', label: 'Drivers', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h3l4 5v3a2 2 0 0 1-2 2h-1"/><circle cx="5.5" cy="18.5" r="1.5"/><circle cx="18.5" cy="18.5" r="1.5"/></svg> },
    { to: '/manager/inhouse-products', label: 'Products', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> },
  ]

  const tabsVisible = isMobile
  const hideSidebar = isMobile

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
        {!isMobile && (
        <div className="topbar" style={{background:'var(--sidebar-bg)', borderBottom:'1px solid var(--sidebar-border)'}}>
          <div style={{display:'flex', alignItems:'center', gap:12, minHeight:48}}>
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
              const src = me.headerLogo ? `${API_BASE}${me.headerLogo}` : fallback
              return <img src={src} alt="BuySial" style={{height:28, width:'auto', objectFit:'contain'}} />
            })()}
            <div
              style={{
                display:'inline-flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:999,
                background:'var(--panel)', border:'1px solid var(--border)', boxShadow:'0 1px 0 rgba(0,0,0,0.15) inset',
              }}
            >
              <span aria-hidden style={{display:'inline-flex', alignItems:'center', color:'var(--muted)'}}>🧑‍💼</span>
              <span style={{fontWeight:800, letterSpacing:0.3}}>
                {`Manager ${me.firstName||''} ${me.lastName||''}`.trim()}
              </span>
            </div>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <button className="btn secondary" onClick={()=> setTheme(t=> t==='light' ? 'dark' : 'light')} title="Toggle theme">
              {theme==='light' ? '🌙 Dark' : '🌞 Light'}
            </button>
            <NavLink to="/manager/inbox/whatsapp" className="btn secondary">Inbox</NavLink>
            <NavLink to="/manager/agents" className="btn secondary">Agents</NavLink>
            <NavLink to="/manager/drivers" className="btn secondary">Drivers</NavLink>
            <button type="button" className="btn danger" onClick={doLogout}>Logout</button>
          </div>
        </div>
        )}
        <div className={`container ${location.pathname.includes('/inbox/whatsapp') ? 'edge-to-edge' : ''}`}>
          <Outlet />
        </div>
      </div>
      {tabsVisible && (
        <nav className="mobile-tabs" role="navigation" aria-label="Primary">
          {mobileTabs.map(tab => (
            <NavLink key={tab.to} to={tab.to} end={tab.to === '/manager'} className={({isActive})=>`tab ${isActive?'active':''}`}>
              <span className="icon">{tab.icon}</span>
              <span style={{fontSize:11}}>{tab.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
