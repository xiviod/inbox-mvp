# inbox-mvp

Phase 1 omnichannel inbox that ingests WhatsApp Cloud, Instagram Messaging, and Facebook Messenger events, normalizes them, stores everything in Postgres, and streams updates to a React demo client over Socket.IO.

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

## Key features

- Canonical message schema persisted in Postgres via Prisma
- Channel adapters for WhatsApp / Instagram / Messenger (inbound + outbound)
- Signature validation (`X-Hub-Signature-256` + `FB_APP_SECRET`)
- Socket.IO `message.new` stream for realtime UI updates
- `/api/send` endpoint with retry/backoff per adapter
- Docker Compose stack (`backend/docker-compose.yml`) with Postgres + API
- Observability: structured logs on disk + `GET /admin/logs`

See `backend/README.md`, `frontend/README.md`, and `DEMO.md` for detailed instructions, ngrok steps, and curl/Postman samples.

