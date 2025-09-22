import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import AdminLayout from './layout/AdminLayout.jsx';
import UserLayout from './layout/UserLayout.jsx';
import AgentLayout from './layout/AgentLayout.jsx';
import ManagerLayout from './layout/ManagerLayout.jsx';

import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminUsers from './pages/admin/Users.jsx';
import Branding from './pages/admin/Branding.jsx';

import UserLogin from './pages/user/Login.jsx';
import UserDashboard from './pages/user/Dashboard.jsx';
import Campaign from './pages/user/Campaign.jsx';

import AgentDashboard from './pages/agent/Dashboard.jsx';
import ManagerDashboard from './pages/manager/Dashboard.jsx';
import ManagerDrivers from './pages/manager/Drivers.jsx';
import AgentInhouseProducts from './pages/agent/AgentInhouseProducts.jsx';
import InvestorDashboard from './pages/investor/Dashboard.jsx';
import InvestorLayout from './layout/InvestorLayout.jsx';
import DriverLayout from './layout/DriverLayout.jsx';

import WhatsAppConnect from './pages/inbox/WhatsAppConnect.jsx';
import WhatsAppInbox from './pages/inbox/WhatsAppInbox.jsx';

import Agents from './pages/user/Agents.jsx';
import Managers from './pages/user/Managers.jsx';
import Investors from './pages/user/Investors.jsx';
import Drivers from './pages/user/Drivers.jsx';
import DriverDashboard from './pages/driver/Dashboard.jsx';
import SubmitOrder from './pages/orders/SubmitOrder.jsx';
import InhouseProducts from './pages/products/InhouseProducts.jsx';
import Warehouse from './pages/warehouse/Warehouse.jsx';
import Shipments from './pages/shipments/Shipments.jsx';
import Reports from './pages/user/Reports.jsx';
import Expenses from './pages/finance/Expenses.jsx';
import Transactions from './pages/finance/Transactions.jsx';
import Support from './pages/support/Support.jsx';
import AgentMe from './pages/agent/Me.jsx';

import { apiGet } from './api.js';

function RequireAuth({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
}

function RequireRole({ roles = [], children }) {
  const [resolvedRole, setResolvedRole] = useState(() => {
    const me = JSON.parse(localStorage.getItem('me') || '{}');
    return me?.role || null;
  });
  const [checking, setChecking] = useState(() => !resolvedRole);

  useEffect(() => {
    if (resolvedRole) return;
    let alive = true;
    (async () => {
      try {
        const { user } = await apiGet('/api/users/me');
        if (!alive) return;
        const role = user?.role || null;
        if (role) {
          localStorage.setItem('me', JSON.stringify(user));
          setResolvedRole(role);
        } else {
          setResolvedRole(null);
        }
      } catch {
        try { localStorage.clear(); } catch {}
        setResolvedRole(null);
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => { alive = false; };
  }, [resolvedRole]);

  if (checking) return (
    <div style={{display:'grid',placeItems:'center',height:'100vh',color:'#9aa4b2'}}>
      <div style={{display:'grid',gap:8,justifyItems:'center'}}>
        <div className="spinner" />
        <div>Loading…</div>
      </div>
    </div>
  );
  const role = resolvedRole;
  if (!roles.includes(role)) {
    if (role === 'agent') return <Navigate to="/agent" replace />;
    if (role === 'manager') return <Navigate to="/manager" replace />;
    if (role === 'investor') return <Navigate to="/investor" replace />;
    if (role === 'admin' || role === 'user') return <Navigate to="/user" replace />;
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<UserLogin />} />

      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="inbox/connect" element={<WhatsAppConnect />} />
        <Route path="inbox/whatsapp" element={<WhatsAppInbox />} />
        <Route path="branding" element={<Branding />} />
      </Route>

      <Route
        path="/driver"
        element={
          <RequireAuth>
            <RequireRole roles={['driver']}>
              <DriverLayout />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route index element={<DriverDashboard />} />
      </Route>

      <Route
        path="/investor"
        element={
          <RequireAuth>
            <RequireRole roles={['investor']}>
              <InvestorLayout />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route index element={<InvestorDashboard />} />
      </Route>

      <Route
        path="/manager"
        element={
          <RequireAuth>
            <RequireRole roles={['manager']}>
              <ManagerLayout />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route index element={<ManagerDashboard />} />
        <Route path="inbox/whatsapp" element={<WhatsAppInbox />} />
        <Route path="agents" element={<Agents />} />
        <Route path="drivers" element={<ManagerDrivers />} />
        <Route path="orders" element={<SubmitOrder />} />
        <Route path="inhouse-products" element={<InhouseProducts />} />
      </Route>

      <Route
        path="/user"
        element={
          <RequireAuth>
            <RequireRole roles={['admin', 'user']}>
              <UserLayout />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route index element={<UserDashboard />} />
        <Route path="inbox/connect" element={<WhatsAppConnect />} />
        <Route path="inbox/whatsapp" element={<WhatsAppInbox />} />
        <Route path="agents" element={<Agents />} />
        <Route path="managers" element={<Managers />} />
        <Route path="investors" element={<Investors />} />
        <Route path="drivers" element={<Drivers />} />
        <Route path="campaigns" element={<Campaign />} />
        <Route path="orders" element={<SubmitOrder />} />
        <Route path="inhouse-products" element={<InhouseProducts />} />
        <Route path="warehouses" element={<Warehouse />} />
        <Route path="shipments" element={<Shipments />} />
        <Route path="reports" element={<Reports />} />
        <Route path="expense" element={<Expenses />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="support" element={<Support />} />
      </Route>

      <Route
        path="/agent"
        element={
          <RequireAuth>
            <RequireRole roles={['agent']}>
              <AgentLayout />
            </RequireRole>
          </RequireAuth>
        }
      >
        {/* Agent dashboard */}
        <Route index element={<AgentDashboard />} />
        <Route path="inbox/whatsapp" element={<WhatsAppInbox />} />
        <Route path="orders" element={<SubmitOrder />} />
        <Route path="inhouse-products" element={<AgentInhouseProducts />} />
        <Route path="me" element={<AgentMe />} />
        <Route path="support" element={<Support />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}