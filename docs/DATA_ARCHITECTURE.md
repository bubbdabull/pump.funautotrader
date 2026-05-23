# Where the data actually comes from

Fly.io is **hosting** the Nest API — it is not the reason you see “minimal” data. The limits are architectural and configurational.

## Three data layers

| Layer | Source | What you get |
|-------|--------|----------------|
| **Live trades** | PumpPortal WebSocket `subscribeTokenTrade` | Buy/sell ticks, mcap, curve — requires `PUMPPORTAL_API_KEY` |
| **Discovery** | pump.fun REST broad scan | Thousands of coins, stale until a trade tick arrives |
| **Holders** | Helius (+ stream estimate) | Verified counts; stream updates on each trade |

Without a PumpPortal API key on the **machine running Nest**, you only get `subscribeNewToken` + `subscribeMigration` (launches, no trade tape).

## Why it feels like “minimal data”

1. **Single relay** — Vercel UI → Fly Socket.IO → one PumpPortal WS. PumpPortal allows one connection per process; the server can only watch **~250–450 mints** for trades at once (rotation). Everything else is REST snapshots.
2. **Secrets on Fly** — Keys in `server/.env` locally do **not** apply to Fly. You must `fly secrets set PUMPPORTAL_API_KEY=...` and redeploy.
3. **Fly app health** — If `https://pump-funautotrader.fly.dev/api/health` times out, the UI gets nothing regardless of scan code.
4. **Browser relay off** — `VITE_PUMPPORTAL_DIRECT=false` means the browser never opens its own PumpPortal connection.

## Fly vs alternatives

| Option | Pros | Cons |
|--------|------|------|
| **Fly (current)** | Always-on API, autotrader, Supabase persist | One shared trade-sub budget for all users |
| **Local Nest** | Full keys in `.env`, easy debug | Must run `npm run start:dev` in `server/` |
| **Hybrid** (`VITE_PUMPPORTAL_HYBRID=true`) | Browser trade stream for tokens you view | API key in Vercel build (single-user OK) |
| **Direct only** (`VITE_PUMPPORTAL_DIRECT=true`) | Max live data in browser | No server autotrader / persistence unless API also up |

## Recommended setup

**Production (best of both):**

1. Fly: `PUMPPORTAL_API_KEY`, `HELIUS_API_KEY`, `SUPABASE_*`, `fly deploy`
2. Vercel: `VITE_API_URL` / `VITE_WS_URL` → Fly, **redeploy after env changes**
3. Optional hybrid: `VITE_PUMPPORTAL_HYBRID=true` + `VITE_PUMPPORTAL_API_KEY` (same key) for token-page trade tape

**Development:**

```bash
cd server && npm run start:dev   # uses server/.env keys
# root .env:
# VITE_API_URL=http://localhost:3001/api
# VITE_WS_URL=http://localhost:3001
```

## Health checks

```bash
curl -s https://pump-funautotrader.fly.dev/api/health
curl -s https://pump-funautotrader.fly.dev/api/pumpportal/status
curl -s https://pump-funautotrader.fly.dev/api/data-health
```

Good status: `apiKeyConfigured: true`, `tradeMessagesReceived` increasing, `subscribedTradeMints` > 50.
