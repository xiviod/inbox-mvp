# Huawei Cloud Deployment Checklist

## Resources to provision

| Layer | Service | Notes |
| --- | --- | --- |
| Compute | **Elastic Cloud Server (ECS)** | 2 vCPU / 4 GB RAM (dev) or 4 vCPU / 8 GB RAM (prod). CentOS/RHEL image, private NIC inside VPC. Install Node.js 18 via `nvm`, `pm2`, `nginx/httpd`. |
| Networking | **VPC + Subnets** | Separate subnets for web tier (ECS/API Gateway) and data tier (TaurusDB, DCS). Configure security groups: allow 80/443 from API Gateway, 4000 for internal health checks, 3306 from ECS → TaurusDB, 6379 from ECS → DCS. |
| Entry | **API Gateway** (or **ELB**) | HTTPS termination, custom domain, forward `/api`, `/socket.io`, `/webhook/*` to ECS. Enable health checks on `/health`. |
| Database | **TaurusDB (MySQL)** | Single primary (2 vCPU / 8 GB RAM) with automated backups. Copy private endpoint + port for `.env`. |
| Cache | **DCS for Redis®** | 1 GB cache (standard) in same subnet. Enable password auth + TLS if required. |
| Storage | **Object Storage Service (OBS)** | Regional bucket for product media and attachments. Enable versioning + lifecycle if desired. |
| AI | **ModelArts Studio - Large Model Deployment** | MaaS endpoint (Qwen/DeepSeek) orchestrated via custom workflow. Generate project-scoped `X-Auth-Token`. |
| Logs | **Log Tank Service (LTS)** | Log group + stream for backend logs. Create AK/SK pair with write permissions. |
| Monitoring | **Cloud Eye** | Dashboards + alarms: ECS CPU, TaurusDB connections/latency, DCS hit ratio, API Gateway 5xx, ModelArts latency. |
| Outbound access | **NAT Gateway** (optional) | Required if ECS resides in private subnet but must reach Meta/Telegram APIs. |

## Environment variable mapping

| .env variable | Huawei Cloud source | Notes |
| --- | --- | --- |
| `PORT` | ECS runtime | Leave `4000` internally; API Gateway maps public 443 → 4000. |
| `FRONTEND_ORIGIN` | ECS/AP Gateway domain | e.g. `https://inbox.example.com`. Needed for CORS + Socket.IO. |
| `DATABASE_URL` | TaurusDB connection URL | Format: `mysql://USER:PASSWORD@<private-ip>:3306/inbox?sslmode=required` (use strong password). |
| `OBS_ENDPOINT`, `OBS_REGION` | OBS console | Example: `https://obs.<region>.myhuaweicloud.com`. Region must match bucket. |
| `OBS_BUCKET` | OBS bucket name | e.g. `inbox-product-media`. |
| `OBS_ACCESS_KEY`, `OBS_SECRET_KEY` | IAM user / agency with OBS access | Scope credentials to specific bucket. |
| `DCS_REDIS_HOST`, `DCS_REDIS_PORT` | DCS instance details | Use private IP + port (default 6379). |
| `DCS_REDIS_PASSWORD` | DCS access password | Configure in DCS console. |
| `DCS_REDIS_TLS` | DCS TLS mode | Set to `true` when TLS is enabled on the instance. |
| `AI_ASSIST_ENDPOINT` | ModelArts deployment URL | Copy from ModelArts *Endpoint* tab (without trailing slash). |
| `AI_ASSIST_VERSION` | ModelArts version tag | Optional, defaults to `latest`. |
| `AI_ASSIST_TOKEN` | ModelArts `X-Auth-Token` | Obtain via IAM authentication or Token API; refresh per expiry policy. |
| `AI_ASSIST_TIMEOUT_MS` | App config | Increase if ModelArts responses exceed 15s. |
| `LTS_ENABLED` | App toggle | Set to `true` to stream logs to LTS. |
| `LTS_ENDPOINT` | LTS ingest endpoint | e.g. `https://lts.<region>.myhuaweicloud.com`. |
| `LTS_PROJECT_ID` | Project ID (console) | Visible in Huawei console right-hand panel. |
| `LTS_LOG_GROUP`, `LTS_LOG_STREAM` | LTS resources | Create group/stream beforehand. |
| `LTS_ACCESS_KEY`, `LTS_SECRET_KEY` | IAM credentials with LTS write perms | Store securely; rotate regularly. |
| `WEBHOOK_VERIFY_TOKEN` | Meta Developer portal | Arbitrary string; must match Meta webhook config. |
| `FB_APP_SECRET` | Meta App | Used for HMAC validation. |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN` | WhatsApp Cloud API | Copy from Meta *API Setup* page. |
| `FB_PAGE_ACCESS_TOKEN` | Meta App → Messenger/Instagram Advanced Messaging | Required for outbound IG/FB messages. |
| `TELEGRAM_BOT_TOKEN` | BotFather | Needed for outbound Telegram replies. |
| `TELEGRAM_WEBHOOK_SECRET` | Custom value | Set when registering bot webhook. |

## Deployment checklist

- [ ] Verify TaurusDB SG allows ECS private IP on port 3306.
- [ ] Attach OBS bucket policy granting the IAM user read/write for `inventory_items.image_url` paths.
- [ ] Populate DCS password in `.env` and test `redis-cli -h $host -a $password PING`.
- [ ] Upload seed inventory CSV / SQL to TaurusDB; confirm OBS keys resolve via signed URLs.
- [ ] Run `npx prisma migrate deploy` and `npm run start` under `pm2`.
- [ ] Build frontend with same-origin settings: `VITE_BACKEND_URL=/api VITE_SOCKET_URL=/socket.io npm run build`.
- [ ] Configure API Gateway mapping for `/socket.io` with sticky sessions disabled (Socket.IO handles state).
- [ ] Enable HTTPS certificate + HSTS at API Gateway once TLS verified.
- [ ] Turn on LTS shipping (`LTS_ENABLED=true`), confirm logs in console.
- [ ] Set Cloud Eye alarms for ECS CPU > 70%, TaurusDB connection errors, ModelArts latency > 3s, API Gateway 5xx > 5/min.


