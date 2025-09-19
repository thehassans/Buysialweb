import React, { useEffect, useRef, useState } from 'react'
import { apiGet, apiPost, API_BASE } from '../../api.js'
import io from 'socket.io-client'

export default function WhatsAppConnect(){
  const [status,setStatus]=useState({connected:false})
  const [qr,setQr]=useState(null)
  const [loading,setLoading]=useState(false)
  const [polling,setPolling]=useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)
  const socketRef = useRef(null)
  const pollTimerRef = useRef(null)
  const backoffRef = useRef(4000) // fallback poll interval
  const lastQrAtRef = useRef(0)

  async function loadStatus(){
    try{ const st = await apiGet('/api/wa/status'); setStatus(st); setUpdatedAt(new Date().toISOString()) }catch(_e){}
  }

  async function connect(){
    setLoading(true)
    try{
      const res = await apiPost('/api/wa/connect', {})
      if(res?.qr) setQr(res.qr)
      // start polling for QR and status
      setPolling(true)
    }catch(_e){
      alert('Failed to start connection')
    }finally{ setLoading(false) }
  }

  async function logout(){
    await apiPost('/api/wa/logout', {})
    setQr(null)
    loadStatus()
  }

  async function resetSession(){
    setLoading(true)
    try{
      await apiPost('/api/wa/logout', {})
      setQr(null)
      setPolling(false)
      await new Promise(r=>setTimeout(r,300))
      const res = await apiPost('/api/wa/connect', {})
      if(res?.qr) setQr(res.qr)
      setPolling(true)
    }catch(_e){ alert('Failed to reset session') }
    finally{ setLoading(false) }
  }

  useEffect(()=>{ loadStatus() },[])

  // Create a Socket.IO connection for live status/QR to avoid aggressive polling
  useEffect(()=>{
    const socket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    })
    socketRef.current = socket
    socket.on('status', (st)=>{
      try{ setStatus(st); setUpdatedAt(new Date().toISOString()) }catch{}
      if (st?.connected){ setQr(null); setPolling(false) }
    })
    socket.on('qr', ({ qr })=>{
      try{ setQr(qr); lastQrAtRef.current = Date.now() }catch{}
    })
    socket.on('connect_error', ()=>{
      // fallback to gentle polling if socket cannot connect
      schedulePollSoon(3000)
    })
    return ()=>{ try{ socket.disconnect() }catch{}; socketRef.current = null }
  }, [])

  function clearPoll(){ if (pollTimerRef.current){ clearTimeout(pollTimerRef.current); pollTimerRef.current = null } }
  function schedulePollSoon(ms){ clearPoll(); pollTimerRef.current = setTimeout(pollOnce, ms) }
  async function pollOnce(){
    const hidden = (()=>{ try{ return document.hidden || !document.hasFocus() }catch{ return false } })()
    if (hidden){ backoffRef.current = Math.max(backoffRef.current||4000, 10000) }
    try{
      const st = await apiGet('/api/wa/status')
      setStatus(st); setUpdatedAt(new Date().toISOString())
      if(!st.connected){
        // Only fetch QR if we don't have one or it is older than ~20s
        const now = Date.now()
        if (!qr || (now - (lastQrAtRef.current||0) > 20000)){
          const qrRes = await apiGet('/api/wa/qr')
          setQr(qrRes.qr || null)
          lastQrAtRef.current = Date.now()
        }
        backoffRef.current = 4000
      } else {
        setQr(null)
        setPolling(false)
        backoffRef.current = 8000
      }
    }catch(e){
      // Respect server/WAF signals
      if (typeof e?.retryAfterMs === 'number' && e.retryAfterMs > 0){
        backoffRef.current = Math.min(Math.max(e.retryAfterMs, 5000), 20000)
      } else if (e?.status === 429 || e?.status === 503){
        backoffRef.current = Math.min((backoffRef.current||4000) * 2, 20000)
      } else {
        backoffRef.current = Math.min((backoffRef.current||4000) * 2, 15000)
      }
    } finally {
      const connected = !!(socketRef.current && socketRef.current.connected)
      if (!connected && polling){ schedulePollSoon(backoffRef.current || 4000) }
    }
  }

  // Start/stop fallback polling based on 'polling' state and socket connectivity
  useEffect(()=>{
    clearPoll()
    if (!polling) return
    const connected = !!(socketRef.current && socketRef.current.connected)
    if (!connected){ schedulePollSoon(500) }
    return ()=> clearPoll()
  }, [polling])

  return (
    <div>
      <div className="card" style={{display:'grid', gap:12}}>
        {/* Header */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap'}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:32,height:32,borderRadius:8,display:'grid',placeItems:'center', background:'linear-gradient(135deg,#22c55e,#10b981)', color:'#fff', fontWeight:800}}>WA</div>
            <div>
              <div style={{fontWeight:800, fontSize:18}}>WhatsApp Connect</div>
              <div className="helper">Link your WhatsApp Business session to receive and send messages</div>
            </div>
          </div>
          <div>
            {status.connected ? (
              <span className="badge" style={{background:'#0f3f33', border:'1px solid #065f46', color:'#c7f9ec'}}>Connected</span>
            ) : (
              <span className="badge" style={{background:'#3b0d0d', border:'1px solid #7f1d1d', color:'#fecaca'}}>Not Connected</span>
            )}
          </div>
        </div>

        {/* Connected summary */}
        {status.connected && (
          <div style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
            <div className="badge" title="WhatsApp number">{String(status.number||'').replace(/@.*/, '')}</div>
            <div className="helper">Session active. You can now use the Inbox.</div>
          </div>
        )}

        {/* Actions & QR */}
        {!status.connected ? (
          <div style={{display:'grid', gridTemplateColumns: qr ? 'minmax(280px, 320px) 1fr' : '1fr', gap:16}}>
            {qr ? (
              <div className="card" style={{display:'grid', gap:10, justifyItems:'center', padding:'16px'}}>
                <img src={qr} alt="WhatsApp QR" style={{width:256,height:256,background:'#fff',padding:8,borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,0.25)'}}/>
                <div style={{fontSize:12, opacity:0.85}}>Open WhatsApp → Link a device → Scan this QR</div>
              </div>
            ) : (
              <div className="card" style={{display:'grid', placeItems:'center', minHeight:220, background:'linear-gradient(135deg, rgba(34,197,94,0.05), rgba(16,185,129,0.05))', border:'1px dashed #234'}}>
                <div style={{opacity:0.8}}>QR not yet generated</div>
              </div>
            )}
            <div style={{display:'grid', gap:12}}>
              <div style={{fontWeight:700}}>How it works</div>
              <ol style={{paddingLeft:18, lineHeight:1.7, opacity:0.9}}>
                <li>Click <b>Generate QR</b> to start a session.</li>
                <li>Open WhatsApp on your phone → Settings → Linked devices.</li>
                <li>Tap <b>Link a device</b> and scan the QR code shown here.</li>
              </ol>
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                <button className="btn" onClick={connect} disabled={loading}>{loading? (<span><span className="spinner"/> Generating…</span>) : 'Generate QR'}</button>
                <button className="btn secondary" onClick={resetSession} disabled={loading}>Reset Session</button>
              </div>
              <div className="helper">Status refreshed {updatedAt ? new Date(updatedAt).toLocaleTimeString() : '—'}</div>
            </div>
          </div>
        ) : (
          <div style={{display:'flex', justifyContent:'flex-end'}}>
            <button className="btn danger" onClick={logout}>Disconnect</button>
          </div>
        )}
      </div>
    </div>
  )
}
