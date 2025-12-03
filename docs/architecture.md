# Huawei Cloud Omnichannel Inbox – Architecture

## High-level view

- **ECS (Elastic Cloud Servers)** host the Node.js backend API (`backend/`) and serve the compiled frontend bundle. Each ECS instance runs the Express app under `pm2`, exposes Socket.IO, and ships logs to Huawei **Log Tank Service (LTS)**.
- **API Gateway** or **Elastic Load Balancer (ELB)** terminates HTTPS, validates client certificates/HSTS, and forwards traffic to the ECS private subnet. Webhook providers (Meta, Telegram) hit the public gateway; internal operators access the same entry point for the UI.
- **TaurusDB (MySQL)** stores canonical conversations, messages, inventory catalog, orders, and order line-items. Prisma connects to TaurusDB over the VPC using a read/write primary instance; replicas can be added for analytics.
- **DCS for Redis®** caches AI copilot responses, conversation state, and any rate-limit counters. The cache reduces ModelArts round-trips and protects TaurusDB from hot read patterns.
- **OBS (Object Storage Service)** holds product media and any large message attachments. The backend writes metadata (OBS object keys) to TaurusDB and generates signed URLs for the frontend.
- **ModelArts Studio (Large Model Development)** powers the AI copilot. The backend invokes a MaaS hosted workflow that combines TaurusDB context, OBS media, and prompt tooling to draft replies, recommend inventory, or create orders.
- **Cloud Eye** monitors ECS CPU/RAM, TaurusDB latency, DCS usage, API Gateway 4xx/5xx, and ModelArts inference health. Alerts feed back into operations dashboards.

```
Meta Channels ─┐                      ┌────────────┐
Telegram  ────┼─> API Gateway / ELB ─>│  ECS/Node  │─┐
Web UI    ────┘                      └────────────┘ │
                                                   │
                                      ┌────────────▼──────────┐
                                      │  Prisma ORM (MySQL)   │
                                      │   TaurusDB Cluster    │
                                      └────────────▲──────────┘
                                                   │
                                      ┌────────────┴──────────┐
                                      │  DCS (Redis cache)    │
                                      └────────────▲──────────┘
                                                   │
                                      ┌────────────┴──────────┐
                                      │  OBS (media assets)   │
                                      └────────────▲──────────┘
                                                   │
                                      ┌────────────┴──────────┐
                                      │ ModelArts Workflow AI │
                                      └────────────▲──────────┘
                                                   │
                                      ┌────────────┴──────────┐
                                      │    Log Tank Service   │
                                      └───────────────────────┘
```

## Data flow

1. **Inbound webhooks** land on the API Gateway. HTTPS requests are forwarded to `/webhook/*` on ECS. `express.raw` captures payloads for HMAC validation (`metaSignature`, `telegramSecret` middleware).
2. **Adapter layer** normalizes each platform into the canonical message schema, persists the payload in TaurusDB, and emits `message.new` over Socket.IO.
3. **Frontend UI** subscribes to `message.new`, fetches `/api/conversations/:id/messages`, and renders OBS-signed attachments. All API calls reuse the same origin (`/api/*`) to work behind reverse proxies.
4. **AI Copilot**: when an agent taps *Run assist*, the backend requests cached suggestions from DCS, falls back to OBS/TaurusDB context enrichment, and invokes the ModelArts REST endpoint with `X-Auth-Token`. Responses are cached for 2 minutes.
5. **Orders & inventory**: accepted recommendations create order rows in TaurusDB (with `Order`/`OrderItem` relations) and decrement inventory stock. OBS image keys are carried forward for UI rendering.
6. **Outbound messaging** uses adapter-specific API clients (Meta Graph API for WhatsApp/Instagram/Messenger, Telegram Bot API) signed with tokens stored in `.env`.
7. **Logging**: structured logs are written to `logs/app.log` and optionally pushed to LTS using access key/secret credentials. Critical events (signature failures, AI errors) are tagged for Cloud Eye alert hooks.
8. **Operations**: Cloud Eye watches ECS (CPU, memory, disk), TaurusDB performance (connections, replication lag), DCS hit ratio, OBS latency, and ModelArts endpoint availability. Alerts page the on-call team with runbook links.

## Network layout

- Place ECS, TaurusDB, and DCS inside the same **VPC** with separate subnets (web tier vs. data tier). Security groups allow 4000/5173 (dev) or 80/443 (prod) inbound only from API Gateway, and MySQL/Redis ports only from ECS.
- OBS is accessed over private endpoints when available; otherwise configure VPC endpoints to avoid public egress.
- Use **NAT Gateway** or **SNAT** for outbound internet access when the backend needs to call Meta / Telegram APIs.

## Deployment workflow

1. Provision ECS via Huawei Cloud console (CentOS/RHEL family). Install Node.js 18 with `nvm`, `pm2`, and configure systemd service scripts if desired.
2. Clone the repo, fill `.env` with Huawei service endpoints, and run `npx prisma migrate deploy`.
3. Build the frontend: `VITE_BACKEND_URL=/api VITE_SOCKET_URL=/socket.io npm run build`. Serve `frontend/dist` via Apache/Nginx or copy into `backend/public`.
4. Configure API Gateway → ECS backend pool. Attach domain, TLS certificate, and set timeouts. Map `/api` and `/socket.io` to backend service, forward `/webhook/*` with pass-through headers.
5. Create OBS bucket + IAM policies, TaurusDB instance (private IP), and DCS cache. Update security groups/ACLs.
6. In ModelArts Studio, deploy the plug-in workflow (prompt template + TaurusDB/OBS connectors). Record endpoint + token for `.env`.
7. Enable LTS log group/stream and Cloud Eye alarms (CPU > 70%, AI latency > 3s, webhook 5xx > 5/min).

## ModelArts workflow guidance (build outside this repo)

- **Inputs:** conversation transcript (last 10 messages), latest inventory from TaurusDB, customer profile (if available), OBS image URLs.
- **Tools/Plugins:** 
  - TaurusDB SQL reader (parameterized query by `conversation_id` / `sku`).
  - OBS signed URL generator for referenced products.
  - Action planner that can call a "CreateOrder" tool (HTTP POST back to `/api/orders`).
- **Prompt strategy:** instruct the MaaS model (Qwen, DeepSeek) to:
  - Detect intent (support vs. purchase).
  - Draft natural language replies in customer language.
  - Suggest up to three relevant inventory items with short pitch lines.
  - When confidence > threshold, call CreateOrder with line items.
- **Outputs:** `reply_text`, optional `suggested_products[]`, `actions[]`. The backend already understands this shape.


