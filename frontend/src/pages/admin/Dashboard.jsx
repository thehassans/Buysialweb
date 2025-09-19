import React, { useEffect, useState } from 'react'
import MetricCard from '../../components/MetricCard.jsx'
import Chart from '../../components/Chart.jsx'
import { apiGet } from '../../api.js'

export default function AdminDashboard(){
  const [totalUsers, setTotalUsers] = useState(0)
  const [salesTotals, setSalesTotals] = useState({ UAE:0, Oman:0, KSA:0, Bahrain:0 })
  const [salesDays, setSalesDays] = useState([])
  useEffect(()=>{
    (async()=>{
      try{
        const { users } = await apiGet('/api/users')
        setTotalUsers(users.length)
      }catch(_e){}
      try{
        const { totals, days } = await apiGet('/api/orders/analytics/last7days')
        if (totals) setSalesTotals({ UAE: totals.UAE||0, Oman: totals.Oman||0, KSA: totals.KSA||0, Bahrain: totals.Bahrain||0 })
        if (days) setSalesDays(days)
      }catch(_e){}
    })()
  },[])

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <div className="page-title gradient heading-blue">Admin Dashboard</div>
          <div className="page-subtitle">Overview of key metrics</div>
        </div>
      </div>
      <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12}}>
        <MetricCard title="Total Users" value={totalUsers} icon="👥" />
        <MetricCard title="Created by Admin" value={totalUsers} icon="👤" />
        <MetricCard title="Last 7d Sales (UAE)" value={salesTotals.UAE} icon="🇦🇪" />
        <MetricCard title="Last 7d Sales (Oman)" value={salesTotals.Oman} icon="🇴🇲" />
        <MetricCard title="Last 7d Sales (KSA)" value={salesTotals.KSA} icon="🇸🇦" />
        <MetricCard title="Last 7d Sales (Bahrain)" value={salesTotals.Bahrain} icon="🇧🇭" />
      </div>
      <div style={{marginTop:12}}>
        <Chart analytics={{ days: salesDays, totals: salesTotals }} />
      </div>
    </div>
  )
}
