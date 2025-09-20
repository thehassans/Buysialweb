import React from 'react'
import IconButton from './IconButton.jsx'

export default function HeaderBar({ title, subtitle, left, right, className = '', style = {} }){
  return (
    <div className={["wa-chat-header", className].filter(Boolean).join(' ')} style={style}>
      {left || null}
      <div style={{display:'grid'}}>
        <div style={{fontWeight:800}}>{title}</div>
        {subtitle ? <div className="helper" style={{fontSize:11}}>{subtitle}</div> : null}
      </div>
      <div style={{marginLeft:'auto', display:'flex', gap:6}}>
        {right || null}
      </div>
    </div>
  )
}
