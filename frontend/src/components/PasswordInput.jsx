import React, { useState } from 'react'

function EyeIcon({ size=18 }){
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
    </svg>
  )
}

function EyeOffIcon({ size=18 }){
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.84 20.84 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a20.84 20.84 0 0 1-4.12 5.23M1 1l22 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function PasswordInput({ value, onChange, placeholder='Password', ...rest }){
  const [show, setShow] = useState(false)
  const aria = show ? 'Hide password' : 'Show password'
  return (
    <div className="input-group" style={{alignItems:'center'}}>
      <input
        className="input"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        {...rest}
      />
      <button
        type="button"
        className="btn secondary"
        onClick={()=>setShow(s=>!s)}
        aria-label={aria}
        title={aria}
        style={{width:40, height:40, display:'grid', placeItems:'center'}}
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  )
}

export default PasswordInput
