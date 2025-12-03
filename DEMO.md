# Demo Guide

## 1. Launch the stack

```bash
# terminal 1 – backend (points at TaurusDB / Huawei resources)
cd backend
cp .env.example .env           # fill in Meta + Huawei creds
npm install                    # installs Prisma, OBS SDK, Redis client
npx prisma generate
npx prisma migrate deploy
npm run dev                    # or docker compose up --build for local Postgres dev

# terminal 2 – frontend
cd ../frontend
npm install
npm run dev
```

Open `http://localhost:5173` for the inbox UI.  
If you are running on ECS, swap the local URLs with the ECS public endpoints.

## 2. Connectivity & Webhooks

For quick testing use ngrok:

```bash
ngrok http 4000
```

Register `https://<subdomain>.ngrok.io/webhook/<channel>` inside your Meta App (WhatsApp / Instagram / Messenger).  
For Telegram, set the webhook:

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://<subdomain>.ngrok.io/webhook/telegram&secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

When deploying on Huawei Cloud replace ngrok with API Gateway (HTTPS) -> ECS.

## 3. ModelArts Copilot

1. Deploy the ModelArts workflow described in the architecture doc.
2. Note the REST endpoint + token and paste them into `AI_ASSIST_ENDPOINT` / `AI_ASSIST_TOKEN`.
3. Seed TaurusDB with inventory records; upload product images to OBS (store the key/URL in the `inventory_items` table).
4. Click **Run assist** in the UI to watch the copilot propose a reply, recommend upsells, and (optionally) create orders.

## 4. Sample webhook curls

`simulate_webhooks.sh` signs payloads for you, but you can also trigger channels manually:

**WhatsApp**
```bash
curl -X POST https://<ngrok>.ngrok.io/webhook/whatsapp \
  -H 'Content-Type: application/json' \
  -H 'X-Hub-Signature-256: <SIG>' \
  -d '{ "object":"whatsapp_business_account", "entry":[{ "id":"WHATSAPP_BUSINESS_ID","changes":[{ "field":"messages","value":{"messages":[{"id":"wamid.HBgL","from":"447700900000","timestamp":"1732939200","text":{"body":"hello from curl"},"type":"text"}]}}]}] }'
```

**Instagram**
```bash
curl -X POST https://<ngrok>.ngrok.io/webhook/instagram \
  -H 'Content-Type: application/json' \
  -H 'X-Hub-Signature-256: <SIG>' \
  -d '{"object":"instagram","entry":[{"messaging":[{"sender":{"id":"IG_SENDER"},"timestamp":1732939200000,"message":{"mid":"mid.$instagram","text":"ping from IG"}}]}]}'
```

**Messenger**
```bash
curl -X POST https://<ngrok>.ngrok.io/webhook/messenger \
  -H 'Content-Type: application/json' \
  -H 'X-Hub-Signature-256: <SIG>' \
  -d '{"object":"page","entry":[{"messaging":[{"sender":{"id":"PSID"},"timestamp":1732939200000,"message":{"mid":"mid.$messenger","text":"FB DM"}}]}]}'
```

**Telegram**
```bash
curl -X POST https://<ngrok>.ngrok.io/webhook/telegram \
  -H 'Content-Type: application/json' \
  -H 'X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>' \
  -d '{"update_id":123456,"message":{"message_id":55,"date":1732939200,"chat":{"id":123456,"type":"private"},"from":{"id":123456,"first_name":"John"},"text":"Hello from Telegram"}}'
```

## 5. What to show in the live demo

1. Send a WhatsApp message → watch it appear instantly in the inbox.
2. Click **Run assist** → AI suggests a reply + upsell (data pulled from TaurusDB/OBS via ModelArts).
3. Accept the recommendation (or send manually) → order is created in TaurusDB, inventory decremented, order panel updates.
4. Highlight OBS image preview + LTS logging (show the dashboard or log stream).
5. Close with architecture slide summarizing ECS + TaurusDB + DCS + OBS + ModelArts + Cloud Eye.

Screenshots/GIFs are not included in this environment, but the frontend shows the conversation feed, AI copilots, orders, and inventory cards as soon as you trigger the flows above.
