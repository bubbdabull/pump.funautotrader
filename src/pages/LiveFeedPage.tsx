import { ProScannerTerminal } from '@/components/terminal/ProScannerTerminal'
import { DataHealthBanner } from '@/components/shared/DataHealthBanner'

export function LiveFeedPage() {
  return (
    <div className="photon-page -m-3 flex h-[calc(100dvh-3.25rem)] flex-col overflow-hidden lg:-m-6 lg:h-[calc(100dvh-3.5rem)]">
      <div className="mb-1 shrink-0 px-1">
        <DataHealthBanner />
      </div>
      <div className="min-h-0 flex-1">
        <ProScannerTerminal />
      </div>
    </div>
  )
}
