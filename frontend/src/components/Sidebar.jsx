import React, { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { API_BASE } from '../api.js'

// Sidebar supports flat links: { to, label, icon? }
// and grouped links: { label, icon?, children: [{ to, label, icon? }, ...] }
export default function Sidebar({ links = [], closed, onToggle }){
  const location = useLocation()
  const [openGroups, setOpenGroups] = useState(()=> new Set())
  const [theme, setTheme] = useState('dark')

  // Simple icon library mapped by label keywords
  function Icon({ name, className }){
    const n = String(name||'').toLowerCase()
    // helpers
    const stroke = 'currentColor'
    const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
    if (n.includes('dashboard')) return (
      <svg {...common} className={className}><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="10" width="7" height="11"/><rect x="3" y="13" width="7" height="8"/></svg>
    )
    if (n.includes('inbox') || n.includes('whatsapp')) return (
      <svg {...common} className={className}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>
    )
    if (n.includes('agent')) return (
      <svg {...common} className={className}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    )
    if (n.includes('manager')) return (
      // User with small settings gear
      <svg {...common} className={className}>
        {/* User */}
        <path d="M14 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="10" cy="7" r="3"/>
        {/* Small gear (simplified) */}
        <circle cx="18" cy="6" r="2"/>
        <path d="M18 2v1"/><path d="M18 9v1"/>
        <path d="M15 6h-1"/><path d="M22 6h-1"/>
        <path d="M16.6 3.5l-.7.7"/><path d="M20.1 7.9l-.7.7"/>
        <path d="M20.1 4.1l-.7-.7"/><path d="M16.6 8.5l-.7-.7"/>
      </svg>
    )
    if (n.includes('investor')) return (
      // Briefcase icon for investors
      <svg {...common} className={className}>
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
        <path d="M2 13h20"/>
      </svg>
    )
    if (n.includes('create')) return (
      // Plus inside a rounded square for Create
      <svg {...common} className={className}>
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <path d="M12 8v8"/>
        <path d="M8 12h8"/>
      </svg>
    )
    if (n.includes('driver')) return (
      // Truck icon to represent drivers
      <svg {...common} className={className}>
        <rect x="2" y="8" width="11" height="7" rx="2"/>
        <path d="M13 11h3l4 3v3a2 2 0 0 1-2 2h-5"/>
        <circle cx="7" cy="19" r="1.5"/>
        <circle cx="18.5" cy="19" r="1.5"/>
      </svg>
    )
    if (n.includes('commerce') || n.includes('orders')) return (
      <svg {...common} className={className}><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 12.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
    )
    if (n.includes('product')) return (
      <svg {...common} className={className}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12l8.73-5.04"/></svg>
    )
    if (n.includes('campaign') || n.includes('ads')) return (
      // Megaphone icon for Campaigns
      <svg {...common} className={className}><path d="M3 11l14-5v12L3 13v-2z"/><path d="M21 8v8"/><path d="M3 21v-6"/></svg>
    )
    if (n.includes('warehouse')) return (
      <svg {...common} className={className}><path d="M3 21V9l9-6 9 6v12"/><path d="M9 21V9h6v12"/></svg>
    )
    if (n.includes('shipment')) return (
      <svg {...common} className={className}><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h5l2 3v5a2 2 0 0 1-2 2h-5"/><circle cx="5.5" cy="19.5" r="1.5"/><circle cx="18.5" cy="19.5" r="1.5"/></svg>
    )
    if (n.includes('expense')) return (
      <svg {...common} className={className}><path d="M3 3h18v4H3z"/><path d="M8 21V7"/><path d="M16 21V7"/></svg>
    )
    if (n.includes('transaction')) return (
      <svg {...common} className={className}><path d="M12 1v22"/><path d="M5 8h14"/><path d="M7 12h10"/><path d="M9 16h6"/></svg>
    )
    if (n.includes('insight') || n.includes('report')) return (
      <svg {...common} className={className}><path d="M3 3v18h18"/><path d="M7 17l4-6 3 4 5-8"/></svg>
    )
    if (n.includes('support')) return (
      <svg {...common} className={className}><circle cx="12" cy="12" r="10"/><path d="M8 15a4 4 0 0 0 8 0V9a4 4 0 0 0-8 0z"/></svg>
    )
    // Default dot
    return (<svg {...common} className={className}><circle cx="12" cy="12" r="3" fill={stroke} stroke="none"/></svg>)
  }

  function applyNavColors(cfg){
    if (!cfg) return
    const RESET_KEYS = ['sidebar-bg','sidebar-border','nav-active-bg','nav-active-fg']
    const { __theme, __reset, ...vars } = cfg
    // If reset requested or no vars, clear custom vars and stored preset
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
      // also flip the app theme when a preset requests it
      localStorage.setItem('theme', __theme)
      document.documentElement.setAttribute('data-theme', __theme === 'light' ? 'light' : 'dark')
    }
  }

  useEffect(()=>{
    // Initialize theme (keep existing preference silently)
    const saved = localStorage.getItem('theme') || 'dark'
    setTheme(saved)
    const final = saved === 'system' ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : saved
    document.documentElement.setAttribute('data-theme', final === 'light' ? 'light' : 'dark')
    // Initialize nav colors
    try{
      const savedColors = JSON.parse(localStorage.getItem('navColors')||'null')
      if (savedColors) applyNavColors(savedColors)
    }catch(_e){}
  },[])

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
      }catch{ /* ignore */ }
    })()
    return ()=>{ cancelled = true }
  },[])

  const navPresets = [
    { title:'Default', cfg:{ __reset:true }, sample:'linear-gradient(135deg,var(--panel-2),var(--panel))' },
    { title:'Purple',  cfg:{ 'sidebar-bg':'#1a1036', 'sidebar-border':'#2b1856', 'nav-active-bg':'#3f1d67', 'nav-active-fg':'#f5f3ff' }, sample:'#7c3aed' },
    { title:'Green',   cfg:{ 'sidebar-bg':'#06251f', 'sidebar-border':'#0b3b31', 'nav-active-bg':'#0f3f33', 'nav-active-fg':'#c7f9ec' }, sample:'#10b981' },
    { title:'Blue',    cfg:{ 'sidebar-bg':'#0b1220', 'sidebar-border':'#223',    'nav-active-bg':'#1e293b', 'nav-active-fg':'#e2e8f0' }, sample:'#2563eb' },
    { title:'Slate',   cfg:{ 'sidebar-bg':'#0f172a', 'sidebar-border':'#1e293b', 'nav-active-bg':'#1f2937', 'nav-active-fg':'#e5e7eb' }, sample:'#334155' },
    { title:'Orange',  cfg:{ 'sidebar-bg':'#2a1304', 'sidebar-border':'#3b1d08', 'nav-active-bg':'#4a1f0a', 'nav-active-fg':'#ffedd5' }, sample:'#f97316' },
    { title:'Pink',    cfg:{ 'sidebar-bg':'#2a0b17', 'sidebar-border':'#3a0f20', 'nav-active-bg':'#4b1026', 'nav-active-fg':'#ffe4e6' }, sample:'#ec4899' },
    { title:'White',   cfg:{ '__theme':'light', 'sidebar-bg':'#ffffff', 'sidebar-border':'#e5e7eb', 'nav-active-bg':'#f1f5f9', 'nav-active-fg':'#111827' }, sample:'#ffffff' },
  ]

  // Determine which group (if any) matches current route
  const activeGroupLabel = useMemo(()=>{
    const path = location?.pathname || ''
    for (const item of links){
      const hasChildren = Array.isArray(item.children) && item.children.length > 0
      if (!hasChildren) continue
      for (const ch of item.children){
        if (path.startsWith(ch.to)) return item.label
      }
    }
    return null
  }, [location?.pathname, links])

  // Open only the active group on mount/route change; keep others closed
  useEffect(()=>{
    setOpenGroups(prev => {
      const next = new Set()
      if (activeGroupLabel) next.add(activeGroupLabel)
      return next
    })
  }, [activeGroupLabel])

  function toggleGroup(key){
    setOpenGroups(prev => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }

  function renderItem(item){
    const hasChildren = Array.isArray(item.children) && item.children.length > 0
    const icon = null
    if (!hasChildren){
      return (
        <NavLink
          key={item.to}
          to={item.to}
          title={item.label}
          className={({isActive}) => isActive ? 'active' : ''}
        >
          <span className="nav-icon" aria-hidden><Icon name={item.label} /></span>
          <span className="nav-label">{item.label}</span>
        </NavLink>
      )
    }
    const key = item.label
    const isOpen = openGroups.has(key)
    return (
      <div key={key} className={`nav-group ${isOpen ? 'open' : ''}`}>
        <button
          type="button"
          className="group-header"
          onClick={()=>toggleGroup(key)}
          title={item.label}
          aria-expanded={isOpen}
          aria-controls={`submenu-${key}`}
        >
          <span className="nav-icon" aria-hidden><Icon name={item.label} /></span>
          <span className="nav-label">{item.label}</span>
          <span className="chev" aria-hidden>{isOpen? '▾' : '▸'}</span>
        </button>
        <div id={`submenu-${key}`} className="submenu" aria-hidden={!isOpen}>
          {item.children.map(ch => (
            <NavLink key={ch.to} to={ch.to} className={({isActive}) => isActive ? 'active' : ''} title={ch.label}>
              <span className="nav-icon child" aria-hidden><Icon name={ch.label} /></span>
              <span className="nav-label">{ch.label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    )
  }

  return (
    <aside className={`sidebar ${closed ? 'closed' : ''}`}>
      <div className="header" style={{display:'flex', alignItems:'center', justifyContent:'center', paddingInline:8, background:'var(--sidebar-bg)', borderBottom:'1px solid var(--sidebar-border)'}}>
        <span className="brand" style={{display:'inline-flex', alignItems:'center'}}>
          {(()=>{
            const fallback = `${import.meta.env.BASE_URL}BuySial2.png`
            const src = branding.headerLogo ? `${API_BASE}${branding.headerLogo}` : fallback
            return (
              <img src={src} alt="BuySial" style={{height:64, width:'auto', objectFit:'contain'}} />
            )
          })()}
        </span>
      </div>
      {/* Swatches removed from sidebar; available in panel headers */}
      <nav className="menu">
        {links.map(item => renderItem(item))}
      </nav>
      <button
        type="button"
        className="sidebar-toggle"
        onClick={()=> onToggle && onToggle()}
        title={closed ? 'Expand menu' : 'Collapse menu'}
        aria-label={closed ? 'Expand menu' : 'Collapse menu'}
      >
        {closed ? '›' : '‹'}
      </button>
    </aside>
  )
}
