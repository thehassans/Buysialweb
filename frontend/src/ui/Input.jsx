import React, { forwardRef } from 'react'

const Input = forwardRef(function Input({ className = '', style = {}, ...props }, ref){
  return (
    <input ref={ref} {...props} className={['input', className].filter(Boolean).join(' ')} style={style} />
  )
})

export default Input
