import { useState } from 'react'
import { Activity, AlertTriangle, Radio, Rocket, Shield, Sparkles } from 'lucide-react'
import { PageTransition } from '@/components/shared/PageTransition'
import { LiveFeedTable } from '@/components/feed/LiveFeedTable'
import { LiveFeedCards } from '@/components/feed/LiveFeedCards'
import { Input } from '@/components/ui/input'
import { useScannerFeed } from '@/hooks/useScanner'
import { sortTokens } from '@/hooks/useTokens'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import { LiveSyncBar } from '@/components/shared/LiveSyncBar'
import { ensureArray } from '@/lib/ensureArray'
import type { PumpToken } from '@/types'
import type { ScannerLane } from '@/lib/feedQuality'
import { cn } from '@/lib/utils'
import { useWsConnection } from '@/hooks/useWsConnection'
import { API_BASE, backendLabel } from '@/lib/apiConfig'
import { isVercelSecurityCheckpoint, VERCEL_CHECKPOINT_HINT } from '@/lib/vercelCheckpoint'

const TABS: { id: ScannerLane; label: string; icon: typeof Sparkles; desc: string }[] = [
  {
    id: 'all',
    label: 'All Live',
    icon: Radio,
    desc: 'Full PumpPortal feed (~80) — primary data source',
  },
  {
    id: 'active',
    label: 'Hot',
    icon: Activity,
    desc: 'Traded in last 2m — ranked by live ticks',
  },
  {
    id: 'tradeable',
    label: 'Tradeable',
    icon: Sparkles,
    desc: 'Stricter filters for auto-trade candidates',
  },
  { id: 'alpha', label: 'Watchlist', icon: Activity, desc: '$3k+ mcap — broader, still filtered' },
  { id: 'graduating', label: 'Graduating', icon: Rocket, desc: 'Highest curve % — nearing PumpSwap' },
]

export function LiveFeedPage() {
  const [lane, setLane] = useState<ScannerLane>('all')
  const [sort, setSort] = useState(lane === 'graduating' ? 'curve' : 'momentum')
  const [filter, setFilter] = useState('')
  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
    dataUpdatedAt,
    displayMode,
    tradeableCount,
  } = useScannerFeed(lane)
  const holdersVerifiedCount = ensureArray<PumpToken>(data).filter((t) => t.holdersVerified).length
  const backend = useBackendStatus()
  const vercelBlocked = isVercelSecurityCheckpoint(backend.error)
  const wsLive = useWsConnection()
  const tokens = ensureArray<PumpToken>(data)

  const filtered = sortTokens(
    tokens.filter((t) => {
      const q = filter.toLowerCase()
      return (
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q)
      )
    }),
    sort === 'curve' ? 'curve' : sort,
  )
  const activeCount = tokens.filter((t) => t.isActive).length

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
          <p className="font-mono text-[10px] text-zinc-600">{API_BASE}</p>
        </div>
      </div>

      {!wsLive && backend.apiReachable && tokens.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Live socket off — feed still polls every 4s from{' '}
            <span className="font-mono text-xs">{backendLabel()}</span>. Hard refresh after deploy
            if this persists.
          </p>
        </div>
      )}

      {vercelBlocked && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{VERCEL_CHECKPOINT_HINT}</p>
        </div>
      )}

      {!vercelBlocked && !backend.apiReachable && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Cannot reach Fly API at pump-funautotrader.fly.dev — run{' '}
            <span className="font-mono">fly deploy</span> in server/ and check env secrets.
          </p>
        </div>
      )}

      <LiveSyncBar
        className="mb-4"
        wsConnected={wsLive && backend.socketConnected}
        dataUpdatedAt={dataUpdatedAt}
        isFetching={isFetching}
        activeCount={activeCount}
        totalCount={tokens.length}
      />

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
          Only trade-grade tokens are stored — thousands of daily launches filtered out
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
          {filtered.length} shown
          {backend.feedTokensOnServer > 0
            ? ` · ${backend.feedTokensOnServer} on PumpPortal stream`
            : ''}
        </span>
      </div>

      {lane === 'active' && filtered.length === 0 && !isLoading && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            No tokens with live trades in the last 2 minutes. PumpPortal trade streams may still be
            warming up — open a token to pin its stream, or check the Tradeable tab.
          </p>
        </div>
      )}

      {lane === 'tradeable' && displayMode === 'watchlist_fallback' && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {holdersVerifiedCount > 0
              ? `${tradeableCount} pass tradeable filters · ${holdersVerifiedCount} verified on-chain — showing watchlist until more qualify.`
              : 'Strict tradeable filters active — holder counts enriching on-chain in the background.'}
          </p>
        </div>
      )}

      {isError && (
        <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <p className="font-medium">Feed request failed</p>
          <p className="mt-1 text-xs text-red-200/80">
            {(error as Error)?.message ??
              'Cannot reach API — run npm run dev with Fly URLs or redeploy Vercel.'}
          </p>
        </div>
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
