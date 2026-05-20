import { useState } from 'react'
import { PageTransition } from '@/components/shared/PageTransition'
import { LiveFeedTable } from '@/components/feed/LiveFeedTable'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useTokenFeed, sortTokens } from '@/hooks/useTokens'
import { ensureArray } from '@/lib/ensureArray'
import type { PumpToken } from '@/types'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import { Filter } from 'lucide-react'

export function LiveFeedPage() {
  const { data: feedData, isLoading, isError: feedError } = useTokenFeed()
  const tokens = ensureArray<PumpToken>(feedData)
  const backend = useBackendStatus()
  const [sort, setSort] = useState('newest')
  const [filter, setFilter] = useState('')
  const [riskMax, setRiskMax] = useState(100)

  const filtered = sortTokens(
    tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(filter.toLowerCase()) &&
        (t.signalScore ?? t.aiRiskScore ?? 50) <= riskMax,
    ),
    sort,
  )

  return (
    <PageTransition>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Live Feed</h1>
          <p className="text-sm text-zinc-500">Real-time Pump.fun token discovery</p>
        </div>
        <div
          className={`flex flex-col items-end gap-0.5 text-xs ${
            backend.statusTone === 'ok'
              ? 'text-emerald-400'
              : backend.statusTone === 'error'
                ? 'text-red-400'
                : 'text-amber-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {backend.statusTone === 'ok' && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  backend.statusTone === 'ok' ? 'bg-emerald-500' : backend.statusTone === 'error' ? 'bg-red-500' : 'bg-amber-500'
                }`}
              />
            </span>
            {backend.statusLine}
          </div>
          <span className="text-zinc-500">
            {backend.backendHost}
            {backend.socketConnected ? ' · realtime on' : ' · realtime connecting'}
            {' · '}
            {tokens.length} in UI
            {backend.feedTokensOnServer > 0 ? ` · ${backend.feedTokensOnServer} on server` : ''}
          </span>
          {backend.configMisconfigured && (
            <span className="max-w-sm text-right text-amber-400/90">
              Vercel env typo: value must be only the URL (not{' '}
              <code className="text-[10px]">VITE_API_URL=...</code>). Redeploy after fix.
            </span>
          )}
          {(backend.statusTone === 'error' || feedError) && !backend.configMisconfigured && (
            <span className="max-w-xs text-right text-red-400/90">
              {feedError
                ? 'Feed request failed — check Fly API and redeploy Vercel'
                : 'Cannot reach API — set VITE_API_URL on Vercel and redeploy'}
            </span>
          )}
          {backend.apiReachable && tokens.length === 0 && !feedError && !isLoading && (
            <span className="max-w-xs text-right text-zinc-500">
              Stream is up; new launches appear in a few seconds.
            </span>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Input placeholder="Filter by symbol..." value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-300"
        >
          <option value="newest">Newest</option>
          <option value="marketCap">Market Cap</option>
          <option value="volume">Volume</option>
          <option value="momentum">Momentum</option>
          <option value="risk">Risk (low first)</option>
        </select>
        <Button variant="outline" size="sm"><Filter className="mr-1 h-3 w-3" /> Risk &lt; {riskMax}</Button>
        <input type="range" min={20} max={100} value={riskMax} onChange={(e) => setRiskMax(+e.target.value)} className="w-24" />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-white/5" />)}</div>
      ) : (
        <LiveFeedTable tokens={filtered} />
      )}
    </PageTransition>
  )
}
