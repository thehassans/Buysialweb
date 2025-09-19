import React, { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../api.js'

export default function WhatsAppConnect(){
  const [status,setStatus]=useState({connected:false})
  const [qr,setQr]=useState(null)
  const [loading,setLoading]=useState(false)
  const [polling,setPolling]=useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)

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

  useEffect(()=>{
    if(!polling) return
    const id = setInterval(async ()=>{
      try{
        const st = await apiGet('/api/wa/status')
        setStatus(st)
        if(!st.connected){
          const qrRes = await apiGet('/api/wa/qr')
          setQr(qrRes.qr)
        } else {
          setQr(null)
          setPolling(false)
        }
      }catch(_e){}
    }, 2000)
    return ()=> clearInterval(id)
  },[polling])

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
