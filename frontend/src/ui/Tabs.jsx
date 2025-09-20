import React from 'react'

export default function Tabs({ items = [], activeKey, onChange }){
  return (
    <div className="mobile-tabs">
      {items.map(it => (
        <button key={it.key} className={["tab", activeKey===it.key?'active':''].join(' ')} onClick={()=> onChange && onChange(it.key)}>
          <span className="icon" aria-hidden>{it.icon || '•'}</span>
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  )
}
