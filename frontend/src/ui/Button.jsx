import React from 'react'

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...props
}){
  const base = 'btn'
  const variantClass = variant === 'secondary' ? 'secondary' : variant === 'danger' ? 'danger' : ''
  const sizeStyle = size === 'sm' ? { padding: '8px 10px' } : size === 'lg' ? { padding: '12px 16px' } : undefined
  const style = {
    ...(fullWidth ? { width: '100%' } : {}),
    ...sizeStyle,
    ...props.style,
  }
  return (
    <button {...props} className={[base, variantClass, className].filter(Boolean).join(' ')} style={style}>
      {children}
    </button>
  )
}
