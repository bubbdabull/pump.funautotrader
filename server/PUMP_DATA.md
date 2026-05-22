# Pump.fun data pipeline (Phronis API)

Best-quality pump.fun data for real-time auto-trading uses **three layers** on a single Fly.io process.

## 1. Discovery (every new token)

| Stream | PumpPortal method | Cost |
|--------|-------------------|------|
| New launches | `subscribeNewToken` | Free |
| Graduations | `subscribeMigration` | Free |

All new pump.fun tokens hit `PumpPortalDataGateway` → live feed → Socket.IO → Vercel UI.

## 2. Trade ticks (EV engine + signals)

| Stream | PumpPortal method | Requires |
|--------|-------------------|----------|
| Per-mint buys/sells | `subscribeTokenTrade` | `PUMPPORTAL_API_KEY` + funded PumpPortal wallet |

Configured on Fly:

- `PUMPPORTAL_MAX_TRADE_SUBS` — how many mints get live trades (default **250**)
- `PUMPPORTAL_TRADE_SUB_ROTATE_MS` — refill slots for alpha/graduating tokens (default **45s**)
- Priority: auto-trader pins → graduating → alpha scanner → momentum/volume

Metering: ~**0.01 SOL per 10,000** trade websocket messages.

## 3. Enrichment (holders, volume, mcap)

| Source | Role |
|--------|------|
| pump.fun REST | Bootstrap + periodic sync (`PUMP_FUN_SYNC_INTERVAL_MS`, default 2 min) |
| Supabase | Persist every token the feed sees |

## Required Fly secrets

```bash
fly secrets set \
  PUMPPORTAL_API_KEY="your_key" \
  SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
```

## Verify after deploy

```bash
curl https://pump-funautotrader.fly.dev/api/pumpportal/status
```

Expect:

- `apiKeyConfigured: true`
- `tradeSubscriptionsEnabled: true`
- `subscribedTradeMints` growing toward `maxTradeSubscriptions`
- `pumpFunSync.lastSyncAt` updating every ~2 minutes

## Vercel frontend

Keep `VITE_PUMPPORTAL_DIRECT=false` so all data flows through Fly (one PumpPortal connection).

## Tuning

| Goal | Change |
|------|--------|
| More live trade data | Raise `PUMPPORTAL_MAX_TRADE_SUBS` (watch SOL meter) |
| Larger scanner feed | Raise `LIVE_FEED_MAX` |
| Fresher holder/volume | Lower `PUMP_FUN_SYNC_INTERVAL_MS` (min 30000) |
