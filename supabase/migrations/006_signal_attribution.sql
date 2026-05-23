-- Signal attribution log for quant/dynamics optimization (server writes via service_role)

CREATE TABLE IF NOT EXISTS "SignalAttribution" (
  id TEXT PRIMARY KEY,
  mint TEXT NOT NULL,
  "timestampMs" BIGINT NOT NULL,
  "tradeConfidenceScore" INTEGER NOT NULL DEFAULT 0,
  "momentumScore" INTEGER NOT NULL DEFAULT 0,
  "migrationProbability" INTEGER NOT NULL DEFAULT 0,
  velocity JSONB NOT NULL DEFAULT '{}',
  burst JSONB NOT NULL DEFAULT '{}',
  "coordinationPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "walletGrowth" INTEGER NOT NULL DEFAULT 0,
  "riskPenalties" TEXT[] NOT NULL DEFAULT '{}',
  "triggerReasons" TEXT[] NOT NULL DEFAULT '{}',
  lifecycle TEXT NOT NULL DEFAULT 'NEW',
  outcome TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_attribution_mint
  ON "SignalAttribution"(mint, "timestampMs" DESC);

CREATE INDEX IF NOT EXISTS idx_signal_attribution_outcome
  ON "SignalAttribution"(outcome, "createdAt" DESC);

ALTER TABLE "SignalAttribution" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'SignalAttribution'
      AND policyname = 'service_role_all_signal_attribution'
  ) THEN
    CREATE POLICY service_role_all_signal_attribution ON "SignalAttribution"
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'SignalAttribution'
      AND policyname = 'authenticated_read_signal_attribution'
  ) THEN
    CREATE POLICY authenticated_read_signal_attribution ON "SignalAttribution"
      FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;
