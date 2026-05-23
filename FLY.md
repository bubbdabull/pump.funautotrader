# Deploy API to Fly.io

Use this instead of Railway when your trial is maxed out.

| Service | Host |
|---------|------|
| **Frontend** | Vercel |
| **API + live feed** | Fly.io (`https://pump-funautotrader.fly.dev`) |

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

# App name must match fly.toml (GitHub deploy uses this name)
fly apps create pump-funautotrader
```

If you see **app not found**, run the command above first, then deploy again.

## 3. Set secrets (from server/.env)

**Never commit secrets.** Copy values from `server/.env`:

```bash
fly secrets set \
  SUPABASE_URL="https://ypzgxjdnllwoohybayus.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="your_service_role_key" \
  PUMPPORTAL_API_KEY="your_pumpportal_key" \
  HELIUS_API_KEY="your_helius_key" \
  SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY"
```

`SUPABASE_SERVICE_ROLE_KEY` must be the **service_role** secret from Supabase → **Settings → API** (Reveal under `service_role`). Do **not** use the `anon` or `sb_publishable_` key — logs will show `Invalid API key`.

Optional — override defaults from `fly.toml`:

```bash
fly secrets set USE_SUPABASE_REST_DB=true

# Optional Upstash Redis (snapshots + persist worker fan-out)
fly secrets set REDIS_URL='rediss://default:TOKEN@YOUR.upstash.io:6379' REDIS_DISABLED=false
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

- https://pump-funautotrader.fly.dev/api/health

Confirm **`heliusKey": true`** — if `false`, holder counts stay at 1–2 and the tradeable feed stays empty.
- https://pump-funautotrader.fly.dev/api/pumpportal/status

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
VITE_API_URL=https://pump-funautotrader.fly.dev/api
VITE_WS_URL=https://pump-funautotrader.fly.dev
VITE_PUMPPORTAL_DIRECT=false
VITE_SUPABASE_URL=https://ypzgxjdnllwoohybayus.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Redeploy Vercel after saving.

## Local frontend → Fly API (no local server)

Root `.env`:

```env
VITE_API_URL=https://pump-funautotrader.fly.dev/api
VITE_WS_URL=https://pump-funautotrader.fly.dev
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
| `fly apps restart pump-funautotrader` | Restart |

## Cost note

Fly.io has a **free allowance** (limited hours/RAM). This config uses:

- 1 shared CPU, 512MB RAM
- `auto_stop_machines = 'off'` so the live WebSocket feed stays up

Check [fly.io/docs/about/pricing](https://fly.io/docs/about/pricing). You may need a card on file even for hobby usage.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Deploy build fails | Run `fly deploy --local-only` or check `fly logs` during build |
| **Machines restarting a lot** | See [Crash loop](#crash-loop-machines-restarting) below |
| Health check failing | `fly logs` — app needs ~5–10s to boot; grace period is 60s in `fly.toml` |
| Vercel still blank | Set `VITE_WS_URL` to `*.fly.dev`, not Vercel domain |
| App name taken | Change `app` in `fly.toml` and redeploy |
| **502 / not listening on 8080** | **Do not set `PORT` in fly secrets** — `fly secrets sync` can copy `PORT=3001` from `server/.env` and break health checks. Run `fly secrets unset PORT -a pump-funautotrader` then redeploy. App binds `0.0.0.0:8080` on Fly automatically. |
| 502 / not responding | `fly status` + `fly logs`; ensure secrets are set |

### Crash loop (machines restarting)

1. **Read previous-start logs** (Fly dashboard → machine → **Logs from Previous Starts**), or:

   ```bash
   fly logs -a pump-funautotrader
   ```

2. **Look for these lines:**
   - `Failed to start:` — Nest bootstrap error (paste into an issue / fix code)
   - `Cannot find module '../quant'` — broken Docker build; redeploy after latest `Dockerfile`
   - `P1000` / `Can't reach database` — bad `DATABASE_URL` secret; use REST mode instead (see below)
   - `[boot]` JSON — shows which secrets Fly actually has at runtime

3. **Set required secrets** (values from `server/.env`, never commit them):

   ```bash
   fly secrets set -a pump-funautotrader \
     SUPABASE_URL="https://YOUR_PROJECT.supabase.co" \
     SUPABASE_SERVICE_ROLE_KEY="your_service_role_key" \
     PUMPPORTAL_API_KEY="your_pumpportal_key"
   ```

4. **Avoid conflicting secrets** — these override `fly.toml` and can crash the app:

   | Secret | Safe value |
   |--------|------------|
   | `USE_SUPABASE_REST_DB` | `true` (or omit — `fly.toml` sets it) |
   | `REDIS_URL` | Upstash `rediss://…` + `REDIS_DISABLED=false` for snapshots/recovery |
   | `REDIS_DISABLED` | `true` if no Redis (default without URL) |
   | `HELIUS_API_KEY` / `SOLANA_RPC_URL` | Dedicated RPC (never rely on public mainnet in prod) |
   | `DATABASE_URL` | **Do not set** unless you use Prisma Postgres with a **working** password |

   If you previously set a broken `DATABASE_URL` on Fly, remove it:

   ```bash
   fly secrets unset -a pump-funautotrader DATABASE_URL
   ```

5. **Redeploy and verify:**

   ```bash
   fly deploy -a pump-funautotrader
   fly open /api/health -a pump-funautotrader
   ```

   Health should return `"supabase":true` and `"pumpportalKey":true` when secrets are set.

6. **Machine count** — keep **one `app` machine** (two app machines = duplicate PumpPortal WS):

   ```bash
   fly scale count app=1 -a pump-funautotrader
   ```

   Optional **persist worker** (async Supabase only, requires `REDIS_URL`):

   ```bash
   fly scale count persist=1 -a pump-funautotrader
   ```

## Architecture

```text
Browser → Vercel (React)
       → Fly.io (Nest API + PumpPortal WS + Socket.IO)
       → Supabase (database via REST)
```
