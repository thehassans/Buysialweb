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
    <div
      className="fixed inset-0 z-[2400] bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadow-md)]"
        onClick={(e)=>e.stopPropagation()}
      >
        <div className="header flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 bg-[var(--panel-2)] rounded-t-xl">
          <h3 className="font-extrabold text-lg">{title}</h3>
          <button className="btn secondary" onClick={onClose}>Close</button>
        </div>
        <div className="px-4 py-3">
          {children}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3">
          {footer}
        </div>
      </div>
    </div>,
    document.body
  )
}
