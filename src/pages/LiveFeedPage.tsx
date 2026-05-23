import { PageTransition } from '@/components/shared/PageTransition'
import { ProScannerTerminal } from '@/components/terminal/ProScannerTerminal'
import { DataHealthBanner } from '@/components/shared/DataHealthBanner'

export function LiveFeedPage() {
  return (
    <PageTransition>
      <div className="mb-2 hidden lg:block">
        <h1 className="text-lg font-bold tracking-tight text-white">Pro Scanner</h1>
        <p className="text-xs text-zinc-500">Institutional realtime terminal · PumpPortal stream</p>
      </div>
      <DataHealthBanner />
      <ProScannerTerminal />
    </PageTransition>
  )
}
