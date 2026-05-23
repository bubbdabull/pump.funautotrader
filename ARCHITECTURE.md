# Phronis Quant Trading Architecture

Deterministic, math-only Pump.fun auto-trading. **No AI / ML.**

## Production data flow (stream-first)

```
PumpPortal WebSocket
        ↓
PumpPortalDataGateway (parse only)
        ↓
IngestionOrchestrator (dedupe + market state)
        ↓
RawEventProcessorService
        ↓
TokenRegistryService (in-memory normalized store)
        ↓
QuantEngine + AutoTrader + TradePersist
        ↓
Socket.IO → React dashboard
```

**REST (pump.fun)** runs every **5 minutes** for discovery/metadata only. It does **not** drive live trade ticks.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite (Vercel) |
| API + WS | NestJS (Fly.io) |
| Quant engine | `@phronis/trading` |
| Live data | PumpPortal WebSocket |
| Registry | `TokenRegistryService` |
| Persistence | Supabase |

## Key modules

| Path | Role |
|------|------|
| `server/src/pumpportal/pumpportal-data.gateway.ts` | Single WS connection, trade subs |
| `server/src/ingestion/` | Dedup + orchestrator |
| `server/src/pipeline/raw-event-processor.service.ts` | Normalize → registry → UI |
| `server/src/pipeline/token-registry.service.ts` | In-memory token store |
| `trading/market/stateManager.ts` | Per-mint trades, balances, scores |
| `server/src/quant/` | EV, rug, strategies |
| `server/src/autotrader/` | Execution signals |
| `server/src/execution/` | PumpPortal trade-local |

## Socket events (UI)

| Event | When |
|-------|------|
| `registry:patch` | Every trade/launch (normalized token) |
| `feed:patch` | Same payload (compat) |
| `trade:tick` | Per trade (ms timestamp) |
| `chart:update` | Throttled candles |
| `quant:update` | Scores after each event |

## Constants (`trading/constants.ts`)

- `PUMP_REST_DISCOVERY_INTERVAL_MS` — REST scan interval (300s)
- `FEED_TRADE_PIN_MAX` — max PumpPortal trade subscriptions
- `LIVE_FEED_MAX` — in-memory registry cap

## Deployment

1. `fly secrets set PUMPPORTAL_API_KEY HELIUS_API_KEY SUPABASE_*`
2. `cd server && fly deploy`
3. Vercel: `VITE_API_URL` / `VITE_WS_URL` → Fly, redeploy after env changes

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) and [docs/DATA_ARCHITECTURE.md](docs/DATA_ARCHITECTURE.md).
