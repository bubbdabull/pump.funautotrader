# Phronis Auto Trader

Pump.fun auto-trading terminal powered by [PumpPortal](https://pumpportal.fun) — **no AI**, rule-based execution only.

## Stack

- **Data:** PumpPortal WebSocket `wss://pumpportal.fun/api/data` (new tokens, migrations)
- **Trades:** [PumpPortal Local Transaction API](https://pumpportal.fun/local-trading-api/trading-api) → `POST /api/trade-local`
- **Frontend:** React + Vite + Solana Wallet Adapter (sign & send txs locally)
- **Backend:** NestJS proxy + optional server-side feed relay

## Quick start

```bash
# Frontend (project root = pump/)
npm install
cp .env.example .env
npm run dev

# API
cd server && npm install && cp .env.example .env
npx prisma generate
npm run start:dev
```

1. Open http://localhost:5173  
2. Connect Phantom / Solflare  
3. Open **Auto Trader** panel (right) → configure rules → **Start Auto-Trade**  
4. New PumpPortal tokens matching your rules trigger buys via your wallet  

## Auto-trade rules

| Rule | Description |
|------|-------------|
| Bonding curve % | Only snipe between min/max curve (e.g. 5–35%) |
| Max market cap | Skip tokens above USD cap |
| Signal score | Rule-based score (lower = better entry) |
| Pool | `auto`, `pump`, `raydium`, `pump-amm`, `bonk` |
| Slippage / priority fee | Passed to PumpPortal |

Manual trades use the same PumpPortal route from any token page **Trade** panel.

## Project layout

```
pump/                 ← open this folder in Cursor
├── src/              ← UI + auto-trader engine
├── server/           ← NestJS + PumpPortal proxy
└── netlify.toml
```

## Important

- Auto-trading requires a **connected wallet** with SOL for fees + trades.
- You sign every transaction locally; the server only builds unsigned txs.
- Test with small amounts on mainnet first.
