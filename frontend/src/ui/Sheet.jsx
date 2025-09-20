import React from 'react'

export default function Sheet({ open, onClose, children, side = 'right' }){
  return (
    <>
      <div className={["sheet-overlay", open ? 'open' : ''].join(' ')} onClick={onClose} />
      <div className={["sheet-panel", open ? 'open' : ''].join(' ')} style={side==='right'?{}:{ left:0, right:'auto', transform: open ? 'translateX(0)' : 'translateX(-100%)' }}>
        {children}
      </div>
    </>
  )
}
