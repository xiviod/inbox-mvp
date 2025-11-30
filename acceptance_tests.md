# Acceptance Test Checklist

Run these after pulling the repo and configuring `.env`.

## 1. Boot the stack

- [ ] `docker compose up` (from `backend/`) starts API and Postgres without errors
- [ ] `GET http://localhost:4000/health` returns `{"status":"ok"}`

## 2. Webhook ingestion

For each channel (WhatsApp, Instagram, Messenger):

- [ ] Run `BASE_URL=http://localhost:4000 FB_APP_SECRET=<secret> ./simulate_webhooks.sh`
- [ ] API responds `200 OK`
- [ ] `messages` table contains the canonical record with `metadata.raw`
- [ ] Socket.IO event `message.new` arrives in the frontend without reload

## 3. Frontend live view

- [ ] `cd frontend && npm run dev` launches the UI on `http://localhost:5173`
- [ ] Conversations list populates from `/api/conversations`
- [ ] Selecting a conversation shows historic messages
- [ ] When another webhook fires, the UI updates live

## 4. Outbound sending

- [ ] In the frontend composer, send a message
- [ ] Backend calls the correct adapter and returns success
- [ ] Outbound message persists in Postgres with `sender=agent`
- [ ] Socket.IO emits the message immediately

## 5. Observability & admin

- [ ] `GET /admin/logs?limit=10` returns recent log entries
- [ ] `logs/app.log` mirrors those entries

Document any deviations or manual steps needed for staging/prod promotion.

