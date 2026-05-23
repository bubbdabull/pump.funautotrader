import { TradingTerminal } from '@/features/dashboard/TradingTerminal'

export function LiveFeedPage() {
  return (
    <div className="-m-3 flex h-[calc(100dvh-3.25rem)] flex-col overflow-hidden lg:-m-6 lg:h-[calc(100dvh-3.5rem)]">
      <TradingTerminal />
    </div>
  )
}
