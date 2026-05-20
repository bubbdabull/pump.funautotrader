# Deploy frontend to Vercel

**Backend on Fly.io** (or Railway) — Vercel only hosts the React UI.

| Service | Host |
|---------|------|
| Frontend | Vercel |
| API + live feed | `https://app-holy-dream-3607.fly.dev` (see **FLY.md**) |

## 1. Import project

1. [vercel.com](https://vercel.com) → **Add New** → **Project**
2. Import GitHub repo: `bubbdabull/pump.funautotrader`
3. **Root Directory:** leave **empty** / `.` — **NOT** `server/`
4. Framework Preset: **Vite**
5. Build Command: `npm run build` (default from `vercel.json`)
6. Output Directory: `dist`

### If you see `404: NOT_FOUND` (Vercel)

That is a **Vercel** error (not Railway). Usually:

| Cause | Fix |
|-------|-----|
| No successful deploy yet | Deployments tab → fix build errors → redeploy |
| Wrong Root Directory (`server`) | Set Root Directory to **repo root** |
| Wrong URL / old preview link | Use the **Production** domain from Vercel dashboard |
| Opening `/api/...` on Vercel | API lives on **Fly.io** — use full URL in env vars, not Vercel `/api` |

**Do not** open `https://your-app.vercel.app/api/tokens/feed` — that path does not exist on Vercel.  
The app calls `https://app-holy-dream-3607.fly.dev/api/...` via `VITE_API_URL`.

## 2. Environment variables

Vercel → Project → **Settings** → **Environment Variables** → add for **Production** (and Preview if you want):

```env
VITE_API_URL=https://app-holy-dream-3607.fly.dev/api
VITE_WS_URL=https://app-holy-dream-3607.fly.dev
VITE_PUMPPORTAL_DIRECT=false
VITE_SUPABASE_URL=https://ypzgxjdnllwoohybayus.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SOLANA_RPC=https://api.mainnet-beta.solana.com
VITE_SOLANA_NETWORK=mainnet-beta
```

Do **not** put `PUMPPORTAL_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` on Vercel — those belong only on Railway (`server/.env`).

## 3. Deploy

Click **Deploy**. Each push to `main` redeploys automatically.

## 4. Verify

1. Open your Vercel URL (e.g. `https://pump.funautotrader.vercel.app`)
2. Dashboard should load with sidebar (dark UI)
3. DevTools → **Network** → requests go to `app-holy-dream-3607.fly.dev`
4. **WS** tab → Socket.IO connects to Railway (not vercel.app)

Railway health check (must work first):

`https://app-holy-dream-3607.fly.dev/api/pumpportal/status`

## Local dev without local API

Root `.env`:

```env
VITE_API_URL=https://app-holy-dream-3607.fly.dev/api
VITE_WS_URL=https://app-holy-dream-3607.fly.dev
VITE_PUMPPORTAL_DIRECT=false
```

```bash
npm run dev
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| White / blank page | Check Vercel build logs; open browser Console |
| No tokens | Railway 502 — fix API deploy first |
| CORS errors | Railway already allows CORS; check `VITE_API_URL` ends with `/api` |
| Socket.IO fails | Set `VITE_WS_URL` to Railway URL (no `/api`) |
