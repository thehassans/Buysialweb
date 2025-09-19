import React from 'react'

export default function Avatar({ name = '?', size = 49, className = '', style = {} }){
  function getInitials(str){
    if (!str) return '?'
    const words = String(str).trim().split(' ').filter(Boolean)
    if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase()
    return String(str).slice(0, 2).toUpperCase()
  }
  function hashCode(str){ let h=0; for(let i=0;i<str.length;i++){ h = str.charCodeAt(i) + ((h<<5) - h) } return h }
  const colors = ['#f87171','#fb923c','#fbbf24','#a3e635','#4ade80','#34d399','#22d3ee','#60a5fa','#818cf8','#a78bfa','#f472b6']
  const color = colors[Math.abs(hashCode(name||'')) % colors.length]
  const initials = getInitials(name)
  const styles = { width: size, height: size, borderRadius: 999, display:'grid', placeItems:'center', fontWeight:600, fontSize: Math.max(12, Math.floor(size*0.36)), color:'#fff', flexShrink:0, background: color, ...style }
  return <div className={["wa-avatar", className].filter(Boolean).join(' ')} style={styles}>{initials}</div>
}
