#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:4000}
SECRET=${FB_APP_SECRET:-dev-secret}
TELEGRAM_SECRET=${TELEGRAM_WEBHOOK_SECRET:-dev-telegram-secret}

signature_for() {
  local file=$1
  python - "$SECRET" "$file" <<'PY'
import sys, hmac, hashlib, pathlib
secret = sys.argv[1].encode()
payload = pathlib.Path(sys.argv[2]).read_bytes()
print('sha256=' + hmac.new(secret, payload, hashlib.sha256).hexdigest())
PY
}

post_payload() {
  local endpoint=$1
  local payload=$2
  local tmp
  tmp=$(mktemp)
  printf '%s' "$payload" >"$tmp"
  local signature
  signature=$(signature_for "$tmp")
  echo "==> POST $BASE_URL$endpoint"
  curl -sS -X POST "$BASE_URL$endpoint" \
    -H 'Content-Type: application/json' \
    -H "X-Hub-Signature-256: $signature" \
    --data "@$tmp"
  echo -e "\n"
  rm "$tmp"
}

WHATSAPP_PAYLOAD='{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WHATSAPP_BUSINESS_ID",
    "changes": [{
      "field": "messages",
      "value": {
        "messages": [{
          "from": "447700900000",
          "id": "wamid.HBgLexample",
          "timestamp": "1732939200",
          "text": { "body": "hi from WhatsApp" },
          "type": "text"
        }],
        "contacts": [{
          "wa_id": "447700900000",
          "profile": { "name": "John" }
        }]
      }
    }]
  }]
}'

INSTAGRAM_PAYLOAD='{
  "object": "instagram",
  "entry": [{
    "id": "PAGE_ID",
    "messaging": [{
      "sender": { "id": "IG_SENDER_ID" },
      "recipient": { "id": "PAGE_ID" },
      "timestamp": 1732939200000,
      "message": {
        "mid": "mid.$instagram",
        "text": "hi from Instagram"
      }
    }]
  }]
}'

MESSENGER_PAYLOAD='{
  "object": "page",
  "entry": [{
    "id": "PAGE_ID",
    "messaging": [{
      "sender": { "id": "PSID" },
      "recipient": { "id": "PAGE_ID" },
      "timestamp": 1732939200000,
      "message": {
        "mid": "mid.$messenger",
        "text": "hi from Messenger"
      }
    }]
  }]
}'

TELEGRAM_PAYLOAD='{
  "update_id": 123456,
  "message": {
    "message_id": 42,
    "date": 1732939200,
    "chat": { "id": 999888777, "type": "private" },
    "from": { "id": 999888777, "first_name": "Alice" },
    "text": "hi from Telegram"
  }
}'

post_payload "/webhook/whatsapp" "$WHATSAPP_PAYLOAD"
post_payload "/webhook/instagram" "$INSTAGRAM_PAYLOAD"
post_payload "/webhook/messenger" "$MESSENGER_PAYLOAD"

echo "==> POST $BASE_URL/webhook/telegram"
curl -sS -X POST "$BASE_URL/webhook/telegram" \
  -H 'Content-Type: application/json' \
  -H "X-Telegram-Bot-Api-Secret-Token: $TELEGRAM_SECRET" \
  -d "$TELEGRAM_PAYLOAD"
echo -e "\n"

