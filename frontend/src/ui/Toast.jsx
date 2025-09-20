import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

const ToastCtx = createContext({
  push: (_type, _message, _opts) => {},
  success: (_m, _o) => {},
  error: (_m, _o) => {},
  info: (_m, _o) => {},
  warn: (_m, _o) => {},
})

export function ToastProvider({ children }){
  const [toasts, setToasts] = useState([])
  const timersRef = useRef(new Map())

  function remove(id){
    setToasts((prev) => prev.filter(t => t.id !== id))
    try{ const tm = timersRef.current.get(id); if (tm){ clearTimeout(tm); timersRef.current.delete(id) } }catch{}
  }

  function push(type, message, opts={}){
    if (!message) return
    const id = `${Date.now()}:${Math.random().toString(36).slice(2,7)}`
    const toast = {
      id,
      type: (type || 'info'),
      message: String(message),
      duration: (typeof opts.duration === 'number' ? opts.duration : (type==='error' ? 5000 : 3200))
    }
    setToasts(prev => [...prev, toast])
    const tm = setTimeout(()=> remove(id), toast.duration)
    timersRef.current.set(id, tm)
  }

  const api = useMemo(()=>({
    push,
    success: (m,o)=> push('success', m, o),
    error:   (m,o)=> push('error',   m, o),
    info:    (m,o)=> push('info',    m, o),
    warn:    (m,o)=> push('warn',    m, o),
  }),[])

  useEffect(()=>{
    // Expose a global for non-React modules like api.js
    try{ window.__toast = { error: (m,o)=>api.error(m,o), success:(m,o)=>api.success(m,o), info:(m,o)=>api.info(m,o), warn:(m,o)=>api.warn(m,o) } }catch{}
    return ()=>{ try{ delete window.__toast }catch{} }
  }, [api])

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div style={{ position:'fixed', right:12, top:12, zIndex: 99999, display:'grid', gap:8, width:'min(360px, 92vw)' }} aria-live="polite" aria-atomic="true">
        {toasts.map(t => (
          <div key={t.id} role="status" style={{
            display:'flex', alignItems:'flex-start', gap:10,
            padding:'10px 12px', borderRadius:10,
            border:'1px solid var(--border)',
            background: t.type==='error' ? 'rgba(127,29,29,0.9)'
                     : t.type==='success' ? 'rgba(6,95,70,0.9)'
                     : t.type==='warn' ? 'rgba(113,63,18,0.9)'
                     : 'rgba(15,23,42,0.9)',
            color:'#fff', boxShadow:'0 10px 28px rgba(0,0,0,0.35)'
          }}>
            <div style={{fontSize:18}}>
              {t.type==='error' ? '✖' : t.type==='success' ? '✔' : t.type==='warn' ? '⚠' : 'ℹ'}
            </div>
            <div style={{flex:1, lineHeight:1.4}}>{t.message}</div>
            <button onClick={()=> remove(t.id)} aria-label="Dismiss" title="Dismiss" className="btn secondary" style={{background:'rgba(0,0,0,0.15)', borderColor:'rgba(255,255,255,0.25)', color:'#fff'}}>×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast(){ return useContext(ToastCtx) }
