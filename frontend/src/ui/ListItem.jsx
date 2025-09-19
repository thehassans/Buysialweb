import React from 'react'

export default function ListItem({ className = '', left, right, children, active = false, onClick }){
  return (
    <div onClick={onClick} className={["wa-chat-item", active ? 'active' : '', className].filter(Boolean).join(' ')}>
      {left}
      <div className="wa-chat-preview">{children}</div>
      {right}
    </div>
  )
}
