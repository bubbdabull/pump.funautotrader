import { lazy, Suspense } from 'react'
import { TradeTape } from '@/components/terminal/TradeTape'

const TradingChart = lazy(() =>
  import('@/components/charts/TradingChart').then((m) => ({ default: m.TradingChart })),
)

interface TerminalChartPanelProps {
  mint: string | null
}

export function TerminalChartPanel({ mint }: TerminalChartPanelProps) {
  if (!mint) {
    return (
      <div className="desk-panel flex flex-1 items-center justify-center text-sm text-zinc-600">
        Chart — select a token
      </div>
    )
  }

  return (
    <div className="desk-center flex min-h-0 flex-1 flex-col gap-2">
      <div className="desk-panel min-h-0 flex-[2] overflow-hidden p-1">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-xs text-zinc-500">
              Loading chart…
            </div>
          }
        >
          <TradingChart mint={mint} variant="embed" />
        </Suspense>
      </div>
      <div className="desk-panel min-h-[120px] shrink-0 overflow-hidden">
        <TradeTape mint={mint} />
      </div>
    </div>
  )
}
