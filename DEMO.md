# Demo Guide

## Start everything

```bash
# terminal 1 – backend + Postgres
cd backend
cp .env.example .env   # fill in secrets
docker compose up --build

# terminal 2 – frontend
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` for the inbox UI.

## Expose via ngrok

```bash
ngrok http 4000
```

Register `https://<subdomain>.ngrok.io/webhook` inside your Meta App (for WhatsApp Cloud, Instagram Messaging, and Facebook Messenger).

## Sample curl payloads

Replace `<SIG>` with a valid signature (`simulate_webhooks.sh` calculates this automatically).

**WhatsApp**

```bash
curl -X POST https://<ngrok>.ngrok.io/webhook/whatsapp \
  -H 'Content-Type: application/json' \
  -H 'X-Hub-Signature-256: <SIG>' \
  -d '{
    "object":"whatsapp_business_account",
    "entry":[{"id":"WHATSAPP_BUSINESS_ID","changes":[{
      "field":"messages",
      "value":{"messages":[{"id":"wamid.HBgL","from":"447700900000","timestamp":"1732939200","text":{"body":"hello from curl"},"type":"text"}]}
    }]}]
  }'
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

## Screenshots

Screenshots/GIFs are not included in this environment, but the frontend shows conversation list + real-time message stream once the above curls (or Meta webhooks) run.

