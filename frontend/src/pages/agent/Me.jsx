import React, { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPatch } from '../../api.js'

export default function AgentMe(){
  const [me, setMe] = useState(()=>{ try{ return JSON.parse(localStorage.getItem('me')||'{}') }catch{ return {} } })
  const [availability, setAvailability] = useState(()=> me?.availability || 'available')
  const [perf, setPerf] = useState({ avgResponseSeconds: null, ordersSubmitted: 0, ordersShipped: 0 })
  const [loading, setLoading] = useState(true)
  const [savingAvail, setSavingAvail] = useState(false)

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPass, setChangingPass] = useState(false)
  const [showPassModal, setShowPassModal] = useState(false)

  // Setup Me: theme + ringtone
  const [theme, setTheme] = useState(()=>{ try{ return localStorage.getItem('theme') || 'dark' }catch{ return 'dark' } })
  const [soundEnabled, setSoundEnabled] = useState(()=>{ try{ const v = localStorage.getItem('wa_sound'); return v ? v !== 'false' : true }catch{ return true } })
  const [ringtone, setRingtone] = useState(()=>{ try{ return localStorage.getItem('wa_ringtone') || 'shopify' }catch{ return 'shopify' } })
  const [ringVol, setRingVol] = useState(()=>{ try{ const v = parseFloat(localStorage.getItem('wa_ringtone_volume')||'1'); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1 }catch{ return 1 } })

  useEffect(()=>{
    let alive = true
    ;(async()=>{
      try{
        const r = await apiGet('/api/users/me')
        if (!alive) return
        setMe(r?.user||{})
        setAvailability(r?.user?.availability || 'available')
      }catch{}
      try{
        const m = await apiGet('/api/users/agents/me/performance')
        if (!alive) return
        setPerf({
          avgResponseSeconds: m?.avgResponseSeconds ?? null,
          ordersSubmitted: m?.ordersSubmitted ?? 0,
          ordersShipped: m?.ordersShipped ?? 0,
        })
      }catch{}
      setLoading(false)
    })()
    return ()=>{ alive=false }
  },[])

  // Apply theme immediately on change
  useEffect(()=>{
    try{ localStorage.setItem('theme', theme) }catch{}
    const root = document.documentElement
    if (theme === 'light') root.setAttribute('data-theme','light')
    else root.removeAttribute('data-theme')
  }, [theme])

  // When modal is open, add a class to the body to apply modal-specific CSS (see styles.css)
  useEffect(()=>{
    try{
      const body = document.body
      if (showPassModal) body.classList.add('modal-open')
      else body.classList.remove('modal-open')
      return ()=> body.classList.remove('modal-open')
    }catch{}
  }, [showPassModal])

  // Professional icons
  function Icon({ name, size=20 }){
    const props = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:'2', strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':true }
    if (name==='cap') return (
      <svg {...props}><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 .7 4 2 6 2s6-1.3 6-2v-5"/></svg>
    )
    if (name==='briefcase') return (
      <svg {...props}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M2 12h20"/></svg>
    )
    if (name==='star') return (
      <svg {...props}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
    )
    if (name==='flame') return (
      <svg {...props}><path d="M8.5 14.5C8.5 16.985 10.515 19 13 19s4.5-2.015 4.5-4.5c0-3.5-3.5-5.5-3.5-8.5 0 0-4 2-4 6 0 .62.13 1.208.36 1.752"/></svg>
    )
    if (name==='award') return (
      <svg {...props}><circle cx="12" cy="8" r="5"/><path d="M8.21 13.89L7 22l5-3 5 3-1.21-8.11"/></svg>
    )
    if (name==='trophy') return (
      <svg {...props}><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v4a5 5 0 0 1-10 0V4z"/><path d="M5 8a3 3 0 0 0 3 3"/><path d="M19 8a3 3 0 0 1-3 3"/></svg>
    )
    return null
  }

  const levels = useMemo(()=>[
    { count: 0,   title: 'Learning Agent', icon: 'cap' },
    { count: 5,   title: 'Working Agent', icon: 'briefcase' },
    { count: 50,  title: 'Skilled Agent',  icon: 'star' },
    { count: 100, title: 'Pro Agent',      icon: 'flame' },
    { count: 250, title: 'Senior Agent',   icon: 'award' },
    { count: 500, title: 'Elite Agent',    icon: 'trophy' },
  ], [])

  const levelInfo = useMemo(()=>{
    const submitted = Number(perf.ordersSubmitted||0)
    let idx = 0
    for (let i=0;i<levels.length;i++){
      if (submitted >= levels[i].count) idx = i
      else break
    }
    const current = levels[idx]
    const next = levels[idx+1] || null
    let pct = 100
    if (next){
      const range = next.count - current.count
      const done = Math.max(0, submitted - current.count)
      pct = Math.max(0, Math.min(100, Math.round((done / Math.max(1, range)) * 100)))
    }
    return { idx, current, next, pct, submitted }
  }, [levels, perf.ordersSubmitted])

  async function updateAvailability(val){
    const v = String(val||'').toLowerCase()
    setAvailability(v)
    setSavingAvail(true)
    try{
      await apiPatch('/api/users/me/availability', { availability: v })
      setMe(m => { const n = { ...m, availability: v }; try{ localStorage.setItem('me', JSON.stringify(n)) }catch{}; return n })
    }catch(err){
      alert(err?.message || 'Failed to update availability')
    }finally{
      setSavingAvail(false)
    }
  }

  async function changePassword(e){
    e?.preventDefault?.()
    if (!currentPassword || !newPassword){ alert('Please fill all fields'); return }
    if (newPassword.length < 6){ alert('New password must be at least 6 characters'); return }
    if (newPassword !== confirmPassword){ alert('New password and confirmation do not match'); return }
    setChangingPass(true)
    try{
      await apiPatch('/api/users/me/password', { currentPassword, newPassword })
      alert('Password updated successfully')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setShowPassModal(false)
    }catch(err){
      alert(err?.message || 'Failed to change password')
    }finally{ setChangingPass(false) }
  }

  function storeSoundPrefs(enabled, tone, vol){
    try{ localStorage.setItem('wa_sound', enabled ? 'true' : 'false') }catch{}
    try{ if (tone) localStorage.setItem('wa_ringtone', tone) }catch{}
    try{ if (typeof vol==='number') localStorage.setItem('wa_ringtone_volume', String(vol)) }catch{}
  }
  function playPreview(){
    try{
      const vol = Math.max(0, Math.min(1, ringVol))
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const now = ctx.currentTime
      function toneAt(t, freq, dur=0.12, type='sine', startGain=0.0001, peakGain=0.26){
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.type = type; o.frequency.setValueAtTime(freq, now + t)
        g.gain.setValueAtTime(startGain, now + t)
        g.gain.exponentialRampToValueAtTime(Math.max(0.03, vol*peakGain), now + t + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, now + t + dur)
        o.connect(g); g.connect(ctx.destination)
        o.start(now + t); o.stop(now + t + dur + 0.02)
      }
      const n = String(ringtone||'').toLowerCase()
      if (n==='shopify'){
        toneAt(0.00, 932, 0.12, 'triangle')
        toneAt(0.10, 1047, 0.12, 'triangle')
        toneAt(0.20, 1245, 0.16, 'triangle')
        return
      }
      if (n==='bell'){
        toneAt(0.00, 880, 0.60, 'sine', 0.0001, 0.40)
        toneAt(0.00, 1760, 0.40, 'sine', 0.0001, 0.18)
        return
      }
      if (n==='ping'){
        toneAt(0.00, 1320, 0.20, 'sine', 0.0001, 0.35)
        return
      }
      if (n==='knock'){
        toneAt(0.00, 200, 0.12, 'sine', 0.0001, 0.50)
        toneAt(0.16, 180, 0.12, 'sine', 0.0001, 0.50)
        return
      }
      // default to a simple beep
      toneAt(0.00, 880, 0.5, 'sine', 0.0001, 0.4)
    }catch{}
  }

  function pill(label, val){
    const active = availability === val
    const color = val==='available' ? '#22c55e' : (val==='busy' ? '#ef4444' : (val==='offline' ? '#6b7280' : '#f59e0b'))
    return (
      <button disabled={savingAvail} className={`btn small ${active? 'success':'secondary'}`} onClick={()=> updateAvailability(val)} style={{display:'inline-flex', alignItems:'center', gap:6}}>
        <span style={{display:'inline-block', width:8, height:8, borderRadius:999, background: color}} />
        {label}
      </button>
    )
  }

  return (
    <div className="content" style={{display:'grid', gap:16, padding:16, maxWidth: 900, margin:'0 auto'}}>
      {/* Profile at top */}
      <div style={{display:'grid', gap:6}}>
        <div style={{fontWeight:800, fontSize:20}}>Profile</div>
        <div className="helper">Manage your availability, view your achievements and update your password.</div>
      </div>
      {/* Profile Card */}
      <div className="panel" style={{display:'grid', gap:12}}>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <div style={{width:44, height:44, borderRadius:999, background:'var(--panel-2)', display:'grid', placeItems:'center', fontWeight:800}}>
            {((me.firstName||'')[0]||'A').toUpperCase()}
          </div>
          <div style={{display:'grid'}}>
            <div style={{fontWeight:800}}>{(me.firstName||'') + ' ' + (me.lastName||'')}</div>
            <div className="helper" style={{fontSize:12}}>{me.email || ''}{me.phone ? ` · ${me.phone}` : ''}</div>
          </div>
          <div style={{marginLeft:'auto', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
            {pill('Available', 'available')}
            {pill('Away', 'away')}
            {pill('Busy', 'busy')}
            {pill('Offline', 'offline')}
          </div>
        </div>
        <div className="helper" style={{fontSize:12}}>Current status: <b>{availability[0].toUpperCase()+availability.slice(1)}</b></div>
      </div>

      {/* Setup Me */}
      <div className="panel" style={{display:'grid', gap:12}}>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span aria-hidden style={{color:'var(--muted)'}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0A1.65 1.65 0 0 0 9 3.09V3a2 2 0 0 1 4 0v.09c0 .67.39 1.28 1 1.57h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0c.3.61.91 1 1.58 1H21a2 2 0 0 1 0 4h-.09c-.67 0-1.28.39-1.57 1z"/></svg></span>
          <div style={{fontWeight:800}}>Setup Me</div>
        </div>
        <div style={{display:'grid', gap:12}}>
          <div style={{display:'grid', gap:6}}>
            <label className="label">Theme</label>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              <button type="button" className={`btn small ${theme==='light'?'success':'secondary'}`} onClick={()=> setTheme('light')}>Light</button>
              <button type="button" className={`btn small ${theme==='dark'?'success':'secondary'}`} onClick={()=> setTheme('dark')}>Dark</button>
            </div>
          </div>
          <div style={{display:'grid', gap:6}}>
            <label className="label">Sound notifications</label>
            <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
              <label style={{display:'inline-flex', alignItems:'center', gap:8}}>
                <input type="checkbox" checked={soundEnabled} onChange={e=> { const v = !!e.target.checked; setSoundEnabled(v); storeSoundPrefs(v) }} />
                <span>Enable</span>
              </label>
              <select className="input" value={ringtone} onChange={e=>{ const k=e.target.value; setRingtone(k); storeSoundPrefs(soundEnabled, k) }} style={{maxWidth:200}}>
                <option value="shopify">Shopify</option>
                <option value="bell">Classic Bell</option>
                <option value="ping">Gentle Ping</option>
                <option value="knock">Knock</option>
                <option value="beep">Beep</option>
              </select>
              <button type="button" className="btn secondary" onClick={playPreview}>Test</button>
              <div style={{display:'inline-flex', alignItems:'center', gap:6}}>
                <span className="helper" style={{fontSize:12}}>Volume</span>
                <input type="range" min="0" max="1" step="0.05" value={ringVol} onChange={e=>{ const v = parseFloat(e.target.value||'1'); setRingVol(v); storeSoundPrefs(soundEnabled, undefined, v) }} />
              </div>
            </div>
            <div className="helper" style={{fontSize:12}}>We’ll play this tone on new WhatsApp messages when your tab is inactive or you’re viewing a different chat.</div>
          </div>
          <div>
            <button type="button" className="btn" onClick={()=>{ setShowPassModal(true); setCurrentPassword(''); setNewPassword(''); setConfirmPassword('') }}>Change Password</button>
          </div>
        </div>
      </div>
      

      {/* Achievements */}
      <div className="panel" style={{display:'grid', gap:12}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div style={{display:'inline-flex', alignItems:'center', gap:8}}>
            <span aria-hidden style={{color:'var(--muted)'}}><Icon name="award" size={18} /></span>
            <div style={{fontWeight:800}}>Achievements</div>
          </div>
          <div className="helper" style={{fontSize:12}}>Orders submitted: <b>{levelInfo.submitted}</b></div>
        </div>
        <div style={{display:'grid', gap:10}}>
          <div style={{fontSize:14, display:'inline-flex', alignItems:'center', gap:8}}>Level {levelInfo.idx} — <Icon name={levelInfo.current.icon} /> {levelInfo.current.title}</div>
          <div style={{position:'relative', height:10, borderRadius:999, background:'var(--panel-2)', overflow:'hidden'}}>
            <div style={{position:'absolute', left:0, top:0, bottom:0, width:`${levelInfo.pct}%`, background:'linear-gradient(90deg,#4ade80,#22c55e)', transition:'width .3s'}}/>
          </div>
          <div className="helper" style={{fontSize:12}}>
            {levelInfo.next ? (
              <span style={{display:'inline-flex', alignItems:'center', gap:6}}>Next: <Icon name={levelInfo.next.icon} /> {levelInfo.next.title} at {levelInfo.next.count} orders</span>
            ) : (
              <span>Max level achieved — keep it up! 🎉</span>
            )}
          </div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:10}}>
          {levels.map((lv, i)=>{
            const unlocked = (perf.ordersSubmitted||0) >= lv.count
            return (
              <div key={lv.count} className="panel" style={{padding:10, border:'1px solid var(--border)', opacity: unlocked? 1 : .6}}>
                <div style={{fontSize:20, color: unlocked? 'var(--fg)' : 'var(--muted)'}}><Icon name={lv.icon} /></div>
                <div style={{fontWeight:700}}>{lv.title}</div>
                <div className="helper" style={{fontSize:12}}>≥ {lv.count} orders</div>
                {unlocked && <div className="badge" style={{marginTop:6, display:'inline-block'}}>Unlocked</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Change password modal */}
      {showPassModal && (
        <div className="modal-backdrop" style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:9999, display:'grid', placeItems:'center'}}>
          <div className="card" role="dialog" aria-modal="true" style={{width:'min(520px, 96vw)', padding:16, display:'grid', gap:12}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div style={{display:'inline-flex', alignItems:'center', gap:8}}>
                <span aria-hidden style={{color:'var(--muted)'}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <div style={{fontWeight:800}}>Change Password</div>
              </div>
              <button className="btn secondary" onClick={()=> setShowPassModal(false)} aria-label="Close">✕</button>
            </div>
            <form onSubmit={changePassword} style={{display:'grid', gap:10}}>
              <div>
                <label className="label">Current password</label>
                <input className="input" type="password" value={currentPassword} onChange={e=> setCurrentPassword(e.target.value)} placeholder="Enter current password" />
              </div>
              <div>
                <label className="label">New password</label>
                <input className="input" type="password" value={newPassword} onChange={e=> setNewPassword(e.target.value)} placeholder="At least 6 characters" />
              </div>
              <div>
                <label className="label">Confirm new password</label>
                <input className="input" type="password" value={confirmPassword} onChange={e=> setConfirmPassword(e.target.value)} placeholder="Re-enter new password" />
              </div>
              <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
                <button type="button" className="btn secondary" onClick={()=> setShowPassModal(false)}>Cancel</button>
                <button className="btn" type="submit" disabled={changingPass}>{changingPass? 'Updating…' : 'Update Password'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
