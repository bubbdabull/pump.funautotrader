# Deploy API to Railway

The **NestJS server** must run 24/7 for live PumpPortal feed + Socket.IO. Railway hosts it; Netlify hosts the React UI.

## 1. Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select `bubbdabull/pump.funautotrader`
3. **Do not** set Root Directory to `server` — leave **empty** (repo root). The build needs the `trading/` folder.

`railway.toml` uses the **Dockerfile** at repo root (reliable monorepo build).

**Settings → Root Directory:** must be **empty** (not `server`).

## 2. Environment variables

In Railway → your service → **Variables**, add:

| Variable | Value |
|----------|--------|
| `USE_SUPABASE_REST_DB` | `true` |
| `SUPABASE_URL` | `https://ypzgxjdnllwoohybayus.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase → Settings → API → **service_role** |
| `PUMPPORTAL_API_KEY` | Your PumpPortal key |
| `PUMP_FUN_API_URL` | `https://frontend-api.pump.fun` |
| `PUMPPORTAL_WS_URL` | `wss://pumpportal.fun/api/data` |
| `PUMPPORTAL_TRADE_URL` | `https://pumpportal.fun/api/trade-local` |
| `REDIS_DISABLED` | `true` |

`PORT` is set automatically by Railway.

Optional: `DATABASE_URL` + `USE_SUPABASE_REST_DB=false` if you fix Postgres pooler login later.

## 3. Deploy

Push to `main` — Railway redeploys automatically.

After deploy, open:

`https://pumpfunautotrader-production.up.railway.app/api/health`  
`https://pumpfunautotrader-production.up.railway.app/api/pumpportal/status`

You should see JSON with `"connected": true`.

Copy your public URL (no trailing slash), e.g. `https://phronis-api-production.up.railway.app`.

## 4. Point Netlify at Railway

Netlify → Site → **Environment variables**:

```env
VITE_API_URL=https://YOUR-SERVICE.up.railway.app/api
VITE_WS_URL=https://YOUR-SERVICE.up.railway.app
VITE_PUMPPORTAL_DIRECT=false
VITE_SUPABASE_URL=https://ypzgxjdnllwoohybayus.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Update `netlify.toml` API redirect (optional):

```toml
to = "https://YOUR-SERVICE.up.railway.app/api/:splat"
```

Redeploy Netlify.

## 5. Local dev (optional)

You can stop running the API locally. Frontend still uses Vite proxy if you run both:

```bash
npm run start:dev   # optional
npm run dev
```

Or point local `.env` at Railway:

```env
VITE_API_URL=https://YOUR-SERVICE.up.railway.app/api
VITE_WS_URL=https://YOUR-SERVICE.up.railway.app
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Application failed to respond / 502 | Push latest `Dockerfile` + `railway.toml`; Root Directory **empty**; port **8080** |
| Build fails on `build:quant` | Root Directory must be **repo root**, not `server` |
| Health check fails | Open `/api/health` first; then check `PUMPPORTAL` vars |
| Netlify blank / no data | Set `VITE_WS_URL` to Railway URL (not Netlify domain) |
| CORS errors | Server allows all origins; check `VITE_API_URL` ends with `/api` |
