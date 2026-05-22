-- One-time purge: remove pre-filter token history so only new tradeable rows accumulate.
-- Safe to re-run (idempotent). Run in Supabase SQL Editor or via MCP execute_sql.
-- Does NOT delete SmartWallet, CopilotLog, BacktestRun, or ExecutionLog.

BEGIN;

DELETE FROM "Alert" WHERE mint IS NOT NULL;
DELETE FROM "Trade";
DELETE FROM "HolderSnapshot";
DELETE FROM "RugScore";
DELETE FROM "WalletActivity";

-- Optional tables (no-op if missing)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'LiquidityHistory') THEN
    EXECUTE 'DELETE FROM "LiquidityHistory"';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'MigrationTracking') THEN
    EXECUTE 'DELETE FROM "MigrationTracking"';
  END IF;
END $$;

DELETE FROM "Token";

COMMIT;
