import React from 'react'

export default function IconButton({ variant = 'secondary', size = 40, className = '', style = {}, children, ...props }){
  const baseClass = variant === 'primary' ? 'btn' : 'btn secondary'
  const styles = { width: size, height: size, padding: 0, display: 'grid', placeItems: 'center', borderRadius: 999, ...style }
  return (
    <button {...props} className={[baseClass, className].filter(Boolean).join(' ')} style={styles}>
      {children}
    </button>
  )
}
