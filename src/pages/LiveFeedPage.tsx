import { useState } from 'react'
import { Activity, Rocket, Shield, Sparkles } from 'lucide-react'
import { PageTransition } from '@/components/shared/PageTransition'
import { LiveFeedTable } from '@/components/feed/LiveFeedTable'
import { LiveFeedCards } from '@/components/feed/LiveFeedCards'
import { Input } from '@/components/ui/input'
import { useScannerFeed } from '@/hooks/useScanner'
import { sortTokens } from '@/hooks/useTokens'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import { ensureArray } from '@/lib/ensureArray'
import type { PumpToken } from '@/types'
import type { ScannerLane } from '@/lib/feedQuality'
import { cn } from '@/lib/utils'

const TABS: { id: ScannerLane; label: string; icon: typeof Sparkles; desc: string }[] = [
  { id: 'all', label: 'Live', icon: Activity, desc: 'All active Pump.fun launches' },
  { id: 'alpha', label: 'Alpha', icon: Sparkles, desc: 'Quality-filtered — junk hidden' },
  { id: 'graduating', label: 'Graduating', icon: Rocket, desc: '78–99% curve — near PumpSwap' },
]

export function LiveFeedPage() {
  const [lane, setLane] = useState<ScannerLane>('all')
  const [sort, setSort] = useState(lane === 'graduating' ? 'curve' : 'momentum')
  const [filter, setFilter] = useState('')
  const { data, isLoading, isError } = useScannerFeed(lane)
  const backend = useBackendStatus()
  const tokens = ensureArray<PumpToken>(data)

  const filtered = sortTokens(
    tokens.filter((t) => t.symbol.toLowerCase().includes(filter.toLowerCase())),
    sort === 'curve' ? 'curve' : sort,
  )

  return (
    <PageTransition>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Pro Scanner</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Institutional filters · real charts · graduation radar
          </p>
        </div>
        <div className={cn('text-right text-xs', backend.statusTone === 'ok' ? 'text-emerald-400' : 'text-amber-400')}>
          <p className="font-medium">{backend.statusLine}</p>
          <p className="text-zinc-600">{backend.backendHost}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon, desc }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setLane(id)
              setSort(id === 'graduating' ? 'curve' : 'momentum')
            }}
            className={cn(
              'flex min-w-[140px] flex-col rounded-xl border px-4 py-3 text-left transition-all',
              lane === id
                ? 'border-violet-500/40 bg-violet-500/10 shadow-lg shadow-violet-900/20'
                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10',
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icon className="h-4 w-4" />
              {label}
            </span>
            <span className="mt-0.5 text-[10px] text-zinc-500">{desc}</span>
          </button>
        ))}
        <div className="flex flex-1 items-center justify-end gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-400/90">
          <Shield className="h-3.5 w-3.5 shrink-0" />
          Low-signal & illiquid tokens never appear in Alpha
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search symbol…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs border-white/10 bg-black/20"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-300"
        >
          {lane === 'graduating' ? (
            <>
              <option value="curve">Curve % (high first)</option>
              <option value="marketCap">Market cap</option>
              <option value="volume">Volume</option>
            </>
          ) : (
            <>
              <option value="momentum">Momentum</option>
              <option value="risk">Best signal</option>
              <option value="volume">Volume</option>
              <option value="marketCap">Market cap</option>
              <option value="newest">Newest</option>
            </>
          )}
        </select>
        <span className="text-xs text-zinc-600">
          {filtered.length} shown · junk filtered server-side
        </span>
      </div>

      {isError && (
        <p className="mb-3 text-sm text-red-400">Scanner API unreachable — check Fly deploy & Vercel env.</p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : (
        <>
          <LiveFeedCards tokens={filtered} />
          <div className="mt-3 hidden md:block">
            <LiveFeedTable tokens={filtered} highlightGraduating={lane === 'graduating'} />
          </div>
        </>
      )}
    </PageTransition>
  )
}
