# Backend – Unified Inbox MVP

Node.js + Express + Prisma service that ingests Meta webhooks, stores canonical messages in Postgres, emits Socket.IO updates, and exposes APIs for the frontend + agents.

## Prerequisites

- Node.js 18+
- Docker & Docker Compose (for local stack)
- Ngrok (or any HTTPS tunnel) to expose webhook URLs to Meta

## Environment

Copy `.env.example` to `.env` and fill in the secrets from Meta:

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default 4000) |
| `DATABASE_URL` | Postgres connection string |
| `WEBHOOK_VERIFY_TOKEN` | Token configured in Meta App webhook settings |
| `FB_APP_SECRET` | Meta App secret for signature validation |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business phone number id |
| `WHATSAPP_TOKEN` | WhatsApp Cloud API token |
| `FB_PAGE_ACCESS_TOKEN` | Page token for Instagram + Messenger messaging |
| `FRONTEND_ORIGIN` | Allowed Socket.IO/CORS origin |
| `GRAPH_API_VERSION` | Meta Graph API version (default `v19.0`) |

## Local development

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

### Docker + Postgres

```bash
cd backend
cp .env.example .env  # edit values
docker compose up --build
```

Compose starts Postgres (`postgres://postgres:postgres@localhost:5432/inbox`) and the API on `http://localhost:4000`.

### Ngrok helper

```bash
ngrok http 4000
```

Use the public URL to register these webhook endpoints inside Meta App → Webhooks:

- `GET https://<ngrok>.ngrok.io/webhook` (verification)
- `POST https://<ngrok>.ngrok.io/webhook/whatsapp`
- `POST https://<ngrok>.ngrok.io/webhook/instagram`
- `POST https://<ngrok>.ngrok.io/webhook/messenger`

Set the verify token to `WEBHOOK_VERIFY_TOKEN`.

## Scripts

- `npm run dev` – hot reload server with nodemon
- `npm run start` – production mode
- `npm run prisma:migrate` – apply migrations in production

## How webhook payloads map to the canonical schema

| Channel | Source fields | Canonical fields |
| --- | --- | --- |
| WhatsApp | `messages[].from`, `messages[].id`, `messages[].timestamp`, `messages[].text/image/video` | `platform_user_id`, `message_id`, `timestamp`, `text/attachments` |
| Instagram | `entry[].messaging[].sender.id`, `.message.mid`, `.message.text` | `platform_user_id`, `message_id`, `text` |
| Messenger | `entry[].messaging[].sender.id`, `.message.mid`, `.message.attachments` | `platform_user_id`, `message_id`, `attachments` |

The raw event (message/status/postback) is stored verbatim in `messages.metadata.raw`.

## Observability

- Structured logs at `logs/app.log`
- `GET /admin/logs?limit=50` returns the most recent entries
- Socket.IO emits `message.new` for every saved message (inbound and outbound)

## Testing webhooks locally

1. Start the stack (`npm run dev` or `docker compose up`)
2. Run `ngrok http 4000`
3. Register webhook URLs with Meta
4. Use the provided `simulate_webhooks.sh` script (from repo root) to send sample payloads; it signs payloads with `FB_APP_SECRET` automatically.

## API overview

- `GET /api/conversations` – latest conversations
- `GET /api/conversations/:conversationId/messages` – history for a conversation
- `POST /api/send` – send an outbound message via the correct adapter
- `GET /admin/logs?limit=50` – most recent log entries

All endpoints return `429` if rate-limited and `401` if webhook signatures do not match.

