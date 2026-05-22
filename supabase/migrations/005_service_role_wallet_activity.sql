-- Ensure service role can write WalletActivity + HolderSnapshot (Fly API)
-- Run in Supabase SQL Editor if inserts fail with RLS errors.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'WalletActivity' AND policyname = 'service_role_all_wallet_activity'
  ) THEN
    CREATE POLICY service_role_all_wallet_activity ON "WalletActivity"
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'HolderSnapshot' AND policyname = 'service_role_all_holder_snapshot'
  ) THEN
    CREATE POLICY service_role_all_holder_snapshot ON "HolderSnapshot"
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
