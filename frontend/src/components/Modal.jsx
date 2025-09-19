import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function Modal({ title, open, onClose, children, footer }){
  if (!open) return null
  useEffect(()=>{
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('modal-open')
    return ()=>{
      document.body.style.overflow = prevOverflow
      document.body.classList.remove('modal-open')
    }
  }, [])
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e)=>e.stopPropagation()}>
        <div className="header">
          <h3>{title}</h3>
          <button className="btn secondary" onClick={onClose}>Close</button>
        </div>
        <div style={{padding:'8px 0'}}>
          {children}
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
          {footer}
        </div>
      </div>
    </div>,
    document.body
  )
}
