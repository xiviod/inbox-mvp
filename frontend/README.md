# Frontend – Live Inbox Demo

Minimal React (Vite) client that shows conversations, loads message history, connects to Socket.IO for real-time updates, and now surfaces AI copilots, inventory data, and order status from Huawei Cloud services.

## Setup

```bash
cd frontend
npm install
npm run dev
```

You can optionally add a `.env` file to override the defaults:

```env
# Local dev (explicit)
VITE_BACKEND_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4000

# Production behind Apache / same-origin proxy
# VITE_BACKEND_URL=/api
# VITE_SOCKET_URL=/socket.io
```

If you leave these unset in production builds the UI will automatically talk to the same origin that serves the static files. The development server proxies `/api` calls to `VITE_BACKEND_URL` (defaults to `http://localhost:4000`).

## Features

- Conversation list synced with backend `/api/conversations`
- Message history with OBS-signed attachment URLs
- Real-time Socket.IO stream (`message.new`)
- Composer posting to `/api/send`
- AI copilot panel (calls `/api/ai/assist`) with upsell recommendations
- Orders panel powered by TaurusDB (`/api/orders`)
- Inventory search backed by TaurusDB + OBS imagery (`/api/inventory`)

## Build

```bash
npm run build
npm run preview
```

