-- Tradeable feed + on-chain holder verification columns

ALTER TABLE "Token" ADD COLUMN IF NOT EXISTS "holdersVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Token" ADD COLUMN IF NOT EXISTS "metadataUri" TEXT;
ALTER TABLE "Token" ADD COLUMN IF NOT EXISTS "twitter" TEXT;
ALTER TABLE "Token" ADD COLUMN IF NOT EXISTS "telegram" TEXT;
ALTER TABLE "Token" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "Token" ADD COLUMN IF NOT EXISTS "tradeQualityScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Token" ADD COLUMN IF NOT EXISTS "isTradeable" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_token_tradeable ON "Token"("isTradeable", "tradeQualityScore" DESC);
CREATE INDEX IF NOT EXISTS idx_token_holders_verified ON "Token"("holdersVerified", holders DESC);

ALTER TABLE "HolderSnapshot" ADD COLUMN IF NOT EXISTS "holdersVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HolderSnapshot" ADD COLUMN IF NOT EXISTS "suspiciousClusterPct" DOUBLE PRECISION DEFAULT 0;

-- Service role full access on Token (REST upserts from Fly API)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'Token' AND policyname = 'service_role_all_token'
  ) THEN
    CREATE POLICY service_role_all_token ON "Token"
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Anon clients keep existing token_select_public policy (read). Service role writes via service_role_all_token.
