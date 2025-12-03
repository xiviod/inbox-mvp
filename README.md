# inbox-mvp

Phase 1 omnichannel inbox that ingests WhatsApp Cloud, Instagram Messaging, Facebook Messenger, and Telegram Bot API events, normalizes them, stores everything in **Huawei Cloud TaurusDB**, and streams updates to a React demo client over Socket.IO. The MVP now plugs into ModelArts Studio for AI assistance, OBS for media, DCS (Redis) for caching, and Log Tank Service for observability.

## Structure

```
inbox-mvp/
  backend/   # Express, Prisma, Socket.IO, adapters, Docker
  frontend/  # React (Vite) demo inbox UI
  simulate_webhooks.sh
  acceptance_tests.md
  DEMO.md
```

## Quick start

```bash
git clone <repo>
cd inbox-mvp/backend
cp .env.example .env    # fill in Meta secrets + DB URL
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev             # starts API on http://localhost:4000

# separate terminal
cd ../frontend
npm install
npm run dev             # starts UI on http://localhost:5173
```

Use `simulate_webhooks.sh` to post signed sample payloads once `FB_APP_SECRET` is set.

> Deploying on Huawei Cloud? Point `DATABASE_URL` at TaurusDB, configure OBS/DCS credentials, and swap ngrok for API Gateway.

## Key features

- Canonical message schema persisted in **TaurusDB (MySQL)** via Prisma
- Channel adapters for WhatsApp / Instagram / Messenger / Telegram (inbound + outbound)
- AI copilot route that calls **ModelArts Studio** to generate multilingual replies + upsells
- OBS-backed media handling with signed URLs, and DCS (Redis) caching for AI responses
- Socket.IO `message.new` stream for realtime UI updates
- `/api/send`, `/api/ai/assist`, `/api/orders`, `/api/inventory` endpoints with retry/backoff per adapter
- Docker Compose stack for local prototyping (swap to TaurusDB/OBS/DCS in production)
- Observability: structured logs on disk + optional Log Tank Service forwarding

See `backend/README.md`, `frontend/README.md`, and `DEMO.md` for detailed instructions, Huawei Cloud setup, and curl/Postman samples.

See `backend/README.md`, `frontend/README.md`, and `DEMO.md` for detailed instructions, ngrok steps, and curl/Postman samples.

