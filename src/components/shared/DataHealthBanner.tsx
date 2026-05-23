import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Radio, Wifi } from 'lucide-react'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'
import { useRealtimeStore } from '@/stores/realtimeStore'
import { useStreamStore } from '@/core/streamStore'

export interface DataHealthReport {
  ok: boolean
  grade: 'good' | 'degraded' | 'poor'
  issues: string[]
  pumpportal: {
    connected: boolean
    subscribedTradeMints: number
    maxTradeSubscriptions: number
    messagesReceived: number
    tradeMessagesReceived?: number
    ingestionLeader?: boolean
    leaderId?: string | null
  }
  supabase: boolean
  helius: boolean
  feed: {
    size: number
    coverage: {
      mandatoryCount: number
      mandatoryWithRecentTrade: number
      feedWithRecentTrade?: number
    }
  }
  db: { tradesLast5m: number; activeTokensLast2m: number }
}

export function DataHealthBanner() {
  const streamHealth = useRealtimeStore((s) => s.streamHealth)
  const ingestionDegraded = useRealtimeStore((s) => s.ingestionDegraded)
  const wsConnected = useStreamStore((s) => s.wsConnected)
  const registryUpdatedAt = useStreamStore((s) => s.updatedAt)

  const { data } = useQuery({
    queryKey: ['data', 'health'],
    queryFn: () => api.get<DataHealthReport>('/data/health').then((r) => r.data),
    refetchInterval: 15_000,
    staleTime: 5_000,
  })

  if (!data) return null

  const subs =
    streamHealth.updatedAt > 0
      ? streamHealth.subscribedTradeMints
      : data.pumpportal.subscribedTradeMints
  const maxSubs =
    streamHealth.maxTradeSubscriptions || data.pumpportal.maxTradeSubscriptions
  const pumpConnected =
    streamHealth.updatedAt > 0 ? streamHealth.connected : data.pumpportal.connected

  const gradeStyles = {
    good: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    degraded: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    poor: 'border-red-500/30 bg-red-500/10 text-red-200',
  }

  const Icon = data.grade === 'good' ? CheckCircle2 : AlertTriangle
  const liveFeed = data.feed.coverage.feedWithRecentTrade ?? data.feed.coverage.mandatoryWithRecentTrade

  return (
    <div className={cn('mb-4 rounded-xl border px-4 py-3 text-sm', gradeStyles[data.grade])}>
      <div className="flex flex-wrap items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            Trade data: {data.grade === 'good' ? 'live' : data.grade === 'degraded' ? 'degraded' : 'poor'}
            {' · '}
            <span className="font-normal opacity-90">
              {subs}/{maxSubs} streams · {liveFeed}/{data.feed.size} live ·{' '}
              {data.db.tradesLast5m} DB trades (5m)
            </span>
          </p>
          {ingestionDegraded && (
            <p className="mt-1 text-[11px] text-amber-200/90">
              Ingestion failover in progress — feed buffered, streams may pause briefly.
            </p>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-3 text-[11px] opacity-80">
            <span className="inline-flex items-center gap-1">
              <Wifi className="h-3 w-3" />
              Socket {wsConnected ? 'connected' : 'disconnected'}
            </span>
            <span className="inline-flex items-center gap-1">
              <Radio className="h-3 w-3" />
              PumpPortal {pumpConnected ? 'up' : 'down'}
              {streamHealth.leaderId ? ` · leader ${streamHealth.leaderId.slice(0, 8)}` : ''}
            </span>
            {registryUpdatedAt > 0 && (
              <span>
                Registry {Math.max(0, Math.round((Date.now() - registryUpdatedAt) / 1000))}s ago
              </span>
            )}
            {(streamHealth.tradeMessagesReceived > 0 || data.pumpportal.tradeMessagesReceived) && (
              <span>
                {streamHealth.tradeMessagesReceived || data.pumpportal.tradeMessagesReceived} trade
                msgs
              </span>
            )}
          </p>
          {data.issues.length > 0 && (
            <ul className="mt-1.5 list-inside list-disc text-xs opacity-90">
              {data.issues.slice(0, 4).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          {!pumpConnected && (
            <p className="mt-1 flex items-center gap-1 text-xs">
              <Radio className="h-3 w-3" /> PumpPortal disconnected — charts need live trade stream.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
