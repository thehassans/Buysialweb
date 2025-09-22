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

  const levels = useMemo(()=>[
    { count: 0,   title: 'Learning Agent', emoji: '🎓' },
    { count: 5,   title: 'Working Agent', emoji: '🛠️' },
    { count: 50,  title: 'Skilled Agent',  emoji: '⭐' },
    { count: 100, title: 'Pro Agent',      emoji: '🔥' },
    { count: 250, title: 'Senior Agent',   emoji: '🏅' },
    { count: 500, title: 'Elite Agent',    emoji: '🏆' },
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
    }catch(err){
      alert(err?.message || 'Failed to change password')
    }finally{ setChangingPass(false) }
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
      <div style={{display:'grid', gap:6}}>
        <div style={{fontWeight:800, fontSize:20}}>Me</div>
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

      {/* Achievements */}
      <div className="panel" style={{display:'grid', gap:12}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div style={{fontWeight:800}}>Achievements</div>
          <div className="helper" style={{fontSize:12}}>Orders submitted: <b>{levelInfo.submitted}</b></div>
        </div>
        <div style={{display:'grid', gap:10}}>
          <div style={{fontSize:14}}>Level {levelInfo.idx} — {levelInfo.current.emoji} {levelInfo.current.title}</div>
          <div style={{position:'relative', height:10, borderRadius:999, background:'var(--panel-2)', overflow:'hidden'}}>
            <div style={{position:'absolute', left:0, top:0, bottom:0, width:`${levelInfo.pct}%`, background:'linear-gradient(90deg,#4ade80,#22c55e)', transition:'width .3s'}}/>
          </div>
          <div className="helper" style={{fontSize:12}}>
            {levelInfo.next ? (
              <span>Next: {levelInfo.next.emoji} {levelInfo.next.title} at {levelInfo.next.count} orders</span>
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
                <div style={{fontSize:20}}>{lv.emoji}</div>
                <div style={{fontWeight:700}}>{lv.title}</div>
                <div className="helper" style={{fontSize:12}}>≥ {lv.count} orders</div>
                {unlocked && <div className="badge" style={{marginTop:6, display:'inline-block'}}>Unlocked</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Change password */}
      <div className="panel" style={{display:'grid', gap:12, maxWidth: 520}}>
        <div style={{fontWeight:800}}>Change Password</div>
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
            <button className="btn" type="submit" disabled={changingPass}>{changingPass? 'Updating…' : 'Update Password'}</button>
          </div>
        </form>
      </div>

    </div>
  )
}
