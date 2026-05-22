# Supabase data pipeline

## Migrations (already on your project)

These are applied via Supabase MCP / SQL Editor:

| Migration | Purpose |
|-----------|---------|
| `001_quant_tables` | RugScore, WalletActivity, HolderSnapshot |
| `002_tradeable_and_holder_verify` | `holdersVerified`, `metadataUri`, `isTradeable` |
| `004_token_live_activity` | `lastTradeAt`, `trades1m`, `volume5mSol`, `isActive` |

Optional: run `005_service_role_wallet_activity.sql` if RLS blocks inserts.

## What was wrong (fixed in app code)

- **Only 2 `Token` rows** while **260+ `WalletActivity` rows** — `upsertToken()` skipped any token that failed the strict tradeable filter, so images/holders/activity were never written to `Token`.
- **`GET /tokens/:mint/trades`** only read in-memory state — after restart or cold mint, trades looked empty even when Supabase had rows.
- **Holder enrichment** updated the live feed but often did not persist to `Token` / `HolderSnapshot`.

## What the server does now

1. **`upsertFeedToken`** — saves every feed-visible token (sets `isTradeable` flag, does not skip row).
2. **`persistFeedToken`** — called on every trade patch, media enrich, and holder update.
3. **`getTrades`** — falls back to `WalletActivity` in Supabase when RAM has no trades.
4. **Trade persist** — writes trades for feed + hot mints from trade #2, upserts token row before activity patch.

## Required Fly secrets

```bash
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # service_role, NOT publishable
USE_SUPABASE_REST_DB=true
HELIUS_API_KEY=...                 # real holder counts
PUMPPORTAL_API_KEY=...             # real trade stream
```

## Verify after deploy

```sql
SELECT COUNT(*) FROM "Token";
SELECT COUNT(*) FROM "WalletActivity";
SELECT mint, holders, "holdersVerified", image IS NOT NULL AS has_image, "isActive", "lastTradeAt"
FROM "Token"
ORDER BY "updatedAt" DESC
LIMIT 20;
```

Token count should grow toward feed size; `lastTradeAt` / `isActive` should update on live mints.
