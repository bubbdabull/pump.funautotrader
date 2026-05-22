# Phronis Quant Trading Architecture

Deterministic, math-only Pump.fun auto-trading. **No AI / ML.**

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite (Vercel) |
| API + WS | NestJS (Fly.io) |
| Quant engine | `@phronis/trading` TypeScript package |
| Live data | PumpPortal WebSocket |
| Persistence | Supabase Postgres (Prisma schema) |
| Optional bus | Redis (`REDIS_URL`) |

## Data flow

```
PumpPortal WS → PumpPortalDataGateway
              → MarketStateManager (in-memory microstructure)
              → QuantEngine (scores, rug, strategies)
              → Socket.IO → React UI
              → ExecutionEngine → PumpPortal trade-local → Wallet sign
```

## Folder structure

```
pump/
├── trading/                    # Deterministic quant library
│   ├── quantitative/           # VWAP, EMA, OFI, volatility, Sharpe-like
│   ├── strategies/             # 5 rule-based strategies
│   ├── rug/                    # R = w1·C + w2·H + w3·L + w4·S + w5·V
│   ├── risk/                   # RRM, SIS, LSI, global risk manager
│   ├── decision/               # EV engine (existing)
│   ├── execution/              # Position size, exits
│   ├── backtest/               # Replay + metrics
│   └── market/                 # Event-sourced state per mint
├── server/src/
│   ├── ingestion/              # Dedup, Redis bus, orchestrator
│   ├── pumpportal/             # Primary WS ingestion
│   ├── quant/                  # REST + WS quant outputs
│   ├── execution/              # Dynamic slippage, sizing, retries
│   ├── risk/                   # Global circuit breaker API
│   ├── backtest/               # POST /backtest/replay
│   └── autotrader/             # Rule-based signals
└── src/                        # React dashboard
```

## Mathematical scores (per token)

| Score | Inputs |
|-------|--------|
| Momentum | MQI, price velocity, mcap acceleration, trade velocity |
| Liquidity | LSI, liquidity growth |
| Buy pressure | OFI, buy % |
| Volatility | Realized σ on tick prices |
| Holder quality | HDI, unique buyer growth |
| Whale confidence | SMS, large buys |
| Rug probability | Weighted R formula |
| Trade confidence | EV + momentum + buy pressure − rug |

## Strategies (deterministic)

1. **Early Momentum** — buy pressure > 70%, liquidity growth, holder growth  
2. **Liquidity Expansion** — liquidity spike, creator inactive  
3. **Migration** — curve near graduation, sustained buys  
4. **Smart Money Follow** — tracked wallets buying  
5. **Mean Reversion Scalp** — volatility spike + oversold + OFI recovery  

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/quant/rankings` | Momentum rankings |
| GET | `/api/quant/analyze/:mint` | Full quant + rug + strategies |
| GET | `/api/risk/state` | Drawdown, circuit breaker |
| PUT | `/api/risk/config` | Risk limits |
| POST | `/api/execution/build` | Sized tx via PumpPortal |
| POST | `/api/backtest/replay` | Historical replay |
| GET | `/api/pumpportal/status` | WS + trade sub health |

## Socket.IO events

- `quant:update` — scores + rug + top strategies  
- `quant:strategy` — strategy fire  
- `quant:rug_warning` — blocked token  
- `autotrader:signal` — EV entry signal  

## PostgreSQL (Prisma)

Extended models: `HolderSnapshot`, `LiquidityHistory`, `RugScore`, `WalletActivity`, `MigrationTracking`, `PnlTracking`, `ExecutionLog`, `CreatorWallet`, `BacktestRun`.

Apply when ready:

```bash
cd server && npx prisma migrate dev --name quant_engine
```

## Redis (optional)

Set `REDIS_URL` and `REDIS_DISABLED=false` for:

- Ingestion pub/sub fan-out  
- Bull `feed` / `trades` workers  

Live trading works without Redis.

## Deployment

1. `fly deploy` with `PUMPPORTAL_API_KEY`  
2. Vercel: `VITE_PUMPPORTAL_DIRECT=false`  
3. Run Prisma migrate against Supabase when using Postgres features  

## Future adapters (stubs)

- PumpStream WS — add `sources/pumpstream.source.ts`  
- Helius enhanced txs — extend `HeliusModule`  
- Jito bundles — `JITO_BUNDLES_ENABLED=true`  
