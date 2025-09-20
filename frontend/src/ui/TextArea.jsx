import React, { forwardRef, useEffect, useRef } from 'react'

const TextArea = forwardRef(function TextArea({ className = '', style = {}, autoResize = false, rows = 3, ...props }, ref){
  const innerRef = useRef(null)
  const refToUse = ref || innerRef

  useEffect(()=>{
    if (!autoResize) return
    const ta = (refToUse && 'current' in refToUse) ? refToUse.current : null
    if (!ta) return
    const resize = () => {
      ta.style.height = 'auto'
      const max = 140
      ta.style.height = Math.min(max, ta.scrollHeight) + 'px'
    }
    resize()
    ta.addEventListener('input', resize)
    return () => ta.removeEventListener('input', resize)
  }, [autoResize, refToUse])

  return (
    <textarea ref={refToUse} rows={rows} {...props} className={['input', className].filter(Boolean).join(' ')} style={style} />
  )
})

export default TextArea
