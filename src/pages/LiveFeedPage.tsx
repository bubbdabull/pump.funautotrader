import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageTransition } from '@/components/shared/PageTransition'
import { LiveFeedTable } from '@/components/feed/LiveFeedTable'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useTokenFeed, sortTokens } from '@/hooks/useTokens'
import { pumpportalApi } from '@/services/api'
import { Filter } from 'lucide-react'

export function LiveFeedPage() {
  const { data: tokens = [], isLoading } = useTokenFeed()
  const { data: stream } = useQuery({
    queryKey: ['pumpportal-status'],
    queryFn: () => pumpportalApi.status(),
    refetchInterval: 5000,
    retry: false,
  })
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
          className={`flex flex-col items-end gap-0.5 text-xs ${stream?.connected ? 'text-emerald-400' : 'text-amber-400'}`}
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {stream?.connected && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${stream?.connected ? 'bg-emerald-500' : 'bg-amber-500'}`}
              />
            </span>
            {stream?.connected ? 'PumpPortal connected' : 'Start API server (npm run start:dev)'}
          </div>
          <span className="text-zinc-500">
            {tokens.length} tokens · {stream?.messagesReceived ?? 0} WS msgs
            {stream?.apiKeyConfigured ? ' · trades on' : ''}
          </span>
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
