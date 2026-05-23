# Production troubleshooting — data pipeline audit

Use this when the feed looks empty, holders frozen, or trades missing.

## Quick diagnosis

```bash
curl -sS -m 20 https://pump-funautotrader.fly.dev/api/health
curl -sS -m 20 https://pump-funautotrader.fly.dev/api/pumpportal/status
curl -sS -m 20 https://pump-funautotrader.fly.dev/api/data-health
```

| Check | Good | Bad |
|-------|------|-----|
| `health` | 200 JSON | timeout / 5xx |
| `apiKeyConfigured` | `true` | `false` → no trade ticks |
| `subscribedTradeMints` | 50–450 | 0 |
| `tradeMessagesReceived` | increasing | 0 with messages > 100 |
| `data-health.issues` | `[]` or minor | `PUMPPORTAL_API_KEY missing` |

Fly secrets (required for production):

```bash
fly secrets set PUMPPORTAL_API_KEY=... HELIUS_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... -a pump-funautotrader
cd server && fly deploy
```

## Root causes (code — not “Fly is slow”)

### 1. Layered filters drop most tokens

Data path: PumpPortal/REST → `liveFeed` (800 max) → `getFeed(lane)` → Socket.IO → React.

- **`all` lane** used to require live WS ticks only; REST `lastTradeAt` did not count → bootstrap looked “dead”.
- **Fix:** `rankAllLiveFeed` + `hasRestMarketActivity` count recent REST trades.
- **`tradeable` lane** stays strict (anti-rug).

### 2. Trade parsing bugs

- Bonding-curve **reserve mistaken for trade SOL** → inflated volume (fixed in `pumpPortalTrade.ts`).
- Missing `txType` → trade dropped (fixed: no default-to-buy).
- Autotrader **reset market state** on snipe after orchestrator already ingested launch (fixed).

### 3. Holder count stuck

- Helius marked every snapshot `verified: true` (fixed).
- `liveFeed.patch` could **lower** holders when verified (fixed: always `Math.max`).
- Stream holder count only updates when mint has trade subscription (~450 cap).

### 4. Frontend double-filter

- Server sends `feed:update` for **`all`** lane; autotrader cache used **`alpha`** → wrong list (fixed: invalidate refetch).
- Scanner dropped WS prepends stricter than server (fixed: trust server for `all`/`alpha` prepends).

### 5. PumpPortal subscription budget

One server WS watches at most **~450** mints. Feed can hold **800**. Unsubscribed mints have no live ticks until rotation.

## Lane expectations

| Lane | What you should see |
|------|---------------------|
| **All Live** | Up to ~120 tokens with volume/holders; REST + WS |
| **Hot** | Needs live WS ticks + 3+ holders |
| **Tradeable** | Strict; may fallback to watchlist |
| **Graduating** | Curve 70–100% band |

## Vercel env (redeploy after change)

```
VITE_API_URL=https://pump-funautotrader.fly.dev/api
VITE_WS_URL=https://pump-funautotrader.fly.dev
VITE_PUMPPORTAL_DIRECT=false
# Optional extra trade tape on token pages:
# VITE_PUMPPORTAL_HYBRID=true
# VITE_PUMPPORTAL_API_KEY=...
```

## Compare RAM vs API

If `liveFeedCount` on status is high but UI empty, the bug is **filtering** (lane), not ingestion.

If `liveFeedCount` is low, the bug is **PumpPortal key**, **REST scan**, or **shouldStore** gates.

See also [DATA_ARCHITECTURE.md](./DATA_ARCHITECTURE.md).
