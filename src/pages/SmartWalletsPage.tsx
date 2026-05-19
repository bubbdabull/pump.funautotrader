import { PageTransition } from '@/components/shared/PageTransition'
import { WalletCard } from '@/components/shared/WalletCard'
import { MOCK_WALLETS } from '@/lib/mock-data'

export function SmartWalletsPage() {
  return (
    <PageTransition>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Smart Money Tracker</h1>
        <p className="text-sm text-zinc-500">Track profitable Solana wallets & copy trade</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {MOCK_WALLETS.map((w, i) => (
          <WalletCard key={w.address} wallet={w} index={i} />
        ))}
      </div>
    </PageTransition>
  )
}
