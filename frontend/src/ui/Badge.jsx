import React from 'react'

export default function Badge({ className = '', variant, children, style = {} }){
  const extra = variant ? variant : ''
  return <span className={["badge", extra, className].filter(Boolean).join(' ')} style={style}>{children}</span>
}
