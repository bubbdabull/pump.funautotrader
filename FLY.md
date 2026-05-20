# Deploy API to Fly.io

Use this instead of Railway when your trial is maxed out.

| Service | Host |
|---------|------|
| **Frontend** | Vercel |
| **API + live feed** | Fly.io (`https://pumpfunautotrader-api.fly.dev`) |

## 1. Install Fly CLI

```bash
brew install flyctl
# or: curl -L https://fly.io/install.sh | sh
```

Login:

```bash
fly auth login
```

## 2. Create app (first time only)

From repo root:

```bash
cd /Volumes/Macintosh2/pump

# Creates app if needed (name in fly.toml: pumpfunautotrader-api)
fly apps create pumpfunautotrader-api
```

If the name is taken, edit `app = '...'` in `fly.toml` to something unique.

## 3. Set secrets (from server/.env)

**Never commit secrets.** Copy values from `server/.env`:

```bash
fly secrets set \
  SUPABASE_URL="https://ypzgxjdnllwoohybayus.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="your_service_role_key" \
  PUMPPORTAL_API_KEY="your_pumpportal_key"
```

Optional — override defaults from `fly.toml`:

```bash
fly secrets set USE_SUPABASE_REST_DB=true REDIS_DISABLED=true
```

List secrets:

```bash
fly secrets list
```

## 4. Deploy

```bash
fly deploy
```

First deploy builds the Docker image (~5–10 min). Watch logs:

```bash
fly logs
```

## 5. Verify

```bash
fly open /api/health
```

Or in browser:

- https://pumpfunautotrader-api.fly.dev/api/health
- https://pumpfunautotrader-api.fly.dev/api/pumpportal/status

Expected health response:

```json
{"ok":true,"service":"phronis-api","at":"..."}
```

Get your URL:

```bash
fly info
```

## 6. Point Vercel at Fly.io

Vercel → **Environment variables**:

```env
VITE_API_URL=https://pumpfunautotrader-api.fly.dev/api
VITE_WS_URL=https://pumpfunautotrader-api.fly.dev
VITE_PUMPPORTAL_DIRECT=false
VITE_SUPABASE_URL=https://ypzgxjdnllwoohybayus.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Redeploy Vercel after saving.

## Local frontend → Fly API (no local server)

Root `.env`:

```env
VITE_API_URL=https://pumpfunautotrader-api.fly.dev/api
VITE_WS_URL=https://pumpfunautotrader-api.fly.dev
VITE_PUMPPORTAL_DIRECT=false
```

```bash
npm run dev
```

## Useful commands

| Command | Purpose |
|---------|---------|
| `fly deploy` | Redeploy after code changes |
| `fly logs` | Live server logs |
| `fly status` | Machine health |
| `fly secrets set KEY=value` | Update env |
| `fly scale count 1` | Keep one machine running |
| `fly apps restart pumpfunautotrader-api` | Restart |

## Cost note

Fly.io has a **free allowance** (limited hours/RAM). This config uses:

- 1 shared CPU, 512MB RAM
- `auto_stop_machines = 'off'` so the live WebSocket feed stays up

Check [fly.io/docs/about/pricing](https://fly.io/docs/about/pricing). You may need a card on file even for hobby usage.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Deploy build fails | Run `fly deploy --local-only` or check `fly logs` during build |
| Health check failing | `fly logs` — usually missing `SUPABASE_SERVICE_ROLE_KEY` |
| Vercel still blank | Set `VITE_WS_URL` to `*.fly.dev`, not Vercel domain |
| App name taken | Change `app` in `fly.toml` and redeploy |
| 502 / not responding | `fly status` + `fly logs`; ensure secrets are set |

## Architecture

```text
Browser → Vercel (React)
       → Fly.io (Nest API + PumpPortal WS + Socket.IO)
       → Supabase (database via REST)
```
