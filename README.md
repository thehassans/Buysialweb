# BuySial Commerce

A monorepo containing a Node.js (Express + MongoDB) backend and a React (Vite) frontend for Admin, User, and Agent panels. Includes initial scaffolding for WhatsApp (Baileys) integration.

## Structure

- `backend/` Express API with authentication, role-based access, admin user management, and placeholders for WhatsApp integration
- `frontend/` React app with Admin, User, and Agent panels, closeable sidebars, and basic dashboards

## Quick Start

1) Backend
- Copy `.env.example` to `.env` and set values
- Install dependencies and run server (commands below)

2) Frontend
- Install dependencies and run dev server (commands below)

## Environment

- Node.js 18+
- MongoDB 5+

## Backend Environment (.env)

```
PORT=4000
MONGO_URI=mongodb://localhost:27017/buysial
JWT_SECRET=supersecret_jwt_key_change_me
CORS_ORIGIN=http://localhost:5173
```

## Run Commands

Backend:
```
cd backend
npm install
npm run dev
```

Frontend:
```
cd frontend
npm install
npm run dev
```

Open:
- Frontend: http://localhost:5173
- Backend: http://localhost:4000

## Default Roles

- `admin`: Can create and list users
- `user`: Normal user access
- `agent`: Agent workspace (placeholder)

## Notes

- WhatsApp integration scaffolding is added. After installing `@whiskeysockets/baileys` and setting up the service, the QR connect and inbox will be functional.
- Graphs and metrics show placeholder values; connect to your real data sources to populate.
