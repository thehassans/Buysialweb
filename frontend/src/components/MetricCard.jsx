import React from 'react'

export default function MetricCard({ title, value, icon, hint }){
  return (
    <div className="card" style={{display:'flex', alignItems:'center', gap:14}}>
      {icon && (
        <div style={{width:42, height:42, borderRadius:999, background:'var(--panel-2)', display:'grid', placeItems:'center', fontSize:20, flexShrink:0}}>
          {icon}
        </div>
      )}
      <div style={{display:'grid', gap:2}}>
        <div className="label" style={{fontSize:13}}>{title}</div>
        <div style={{fontSize:20, fontWeight:800}}>{value}</div>
        {hint && <div className="helper" style={{fontSize:11}}>{hint}</div>}
      </div>
    </div>
  )
}
