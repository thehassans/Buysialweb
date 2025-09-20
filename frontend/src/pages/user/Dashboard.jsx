import React, { useEffect, useState } from 'react'
import MetricCard from '../../components/MetricCard.jsx'
import Chart from '../../components/Chart.jsx'
import { apiGet } from '../../api.js'

export default function UserDashboard(){
  const me = JSON.parse(localStorage.getItem('me')||'{}')
  const [analytics, setAnalytics] = useState(null)
  useEffect(()=>{
    (async ()=>{
      try{ setAnalytics(await apiGet('/api/orders/analytics/last7days')) }catch(_e){ setAnalytics({ days: [], totals:{} }) }
    })()
  },[])
  return (
    <div className="container">
      <div className="page-header">
        <div>
          <div className="page-title gradient heading-purple">Dashboard</div>
          <div className="page-subtitle">Your business at a glance</div>
        </div>
      </div>
      <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:12}}>
        <MetricCard title="Total Sales" value={0} icon="💰" />
        <MetricCard title="Total Orders" value={0} icon="🧾" />
        <MetricCard title="Pending Orders" value={0} icon="⏳" />
        <MetricCard title="Out for Delivery" value={0} icon="🚚" />
        <MetricCard title="Delivered Orders" value={0} icon="✅" />
        <MetricCard title="Cancelled Orders" value={0} icon="❌" />
        <MetricCard title="Total Products In House" value={0} icon="🏠" />
        <MetricCard title="Total Deposit" value={0} icon="📥" />
        <MetricCard title="Total Withdraw" value={0} icon="📤" />
        <MetricCard title="Total Expense" value={0} icon="💸" />
      </div>
      <div style={{marginTop:12}}>
        <Chart analytics={analytics} />
      </div>
    </div>
  )
}
