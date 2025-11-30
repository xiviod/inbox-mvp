# Frontend – Live Inbox Demo

Minimal React (Vite) client that shows conversations, loads message history, connects to Socket.IO for real-time updates, and lets an agent send replies via `/api/send`.

## Setup

```bash
cd frontend
npm install
npm run dev
```

Set `VITE_SOCKET_URL` in a `.env` file if your backend is not at `http://localhost:4000`.

```env
VITE_SOCKET_URL=http://localhost:4000
VITE_BACKEND_URL=http://localhost:4000
```

The development server proxies `/api` calls to `VITE_BACKEND_URL` (defaults to `http://localhost:4000`).

## Features

- Conversation list synced with backend `/api/conversations`
- Message history per conversation
- Real-time Socket.IO stream (`message.new`)
- Composer posting to `/api/send`

## Build

```bash
npm run build
npm run preview
```

