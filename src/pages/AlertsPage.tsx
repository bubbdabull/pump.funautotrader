import { PageTransition } from '@/components/shared/PageTransition'
import { GlassCard } from '@/components/shared/GlassCard'
import { Badge } from '@/components/ui/badge'
import { useAlerts, useMarkAlertRead } from '@/hooks/useAlerts'
import { formatDistanceToNow } from 'date-fns'
import { Bell, AlertTriangle, TrendingUp, Wallet, Sparkles } from 'lucide-react'
import type { Alert } from '@/types'

const icons: Record<Alert['type'], typeof Bell> = {
  price: TrendingUp,
  whale: Wallet,
  trade: AlertTriangle,
  wallet: Wallet,
  token: Sparkles,
}

export function AlertsPage() {
  const { data: alerts = [], isLoading, isError } = useAlerts()
  const markRead = useMarkAlertRead()

  return (
    <PageTransition>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Alerts</h1>
        <p className="text-sm text-zinc-500">
          Live from Supabase · new tokens, whale trades, and signals
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-amber-400">
          Could not load alerts — check server/.env DATABASE_URL and restart the API.
        </p>
      )}

      {!isLoading && !isError && alerts.length === 0 && (
        <p className="text-sm text-zinc-500">
          No alerts yet. They appear when PumpPortal streams new tokens (API server running).
        </p>
      )}

      <div className="space-y-3">
        {alerts.map((alert) => {
          const Icon = icons[alert.type] ?? Bell
          return (
            <GlassCard
              key={alert.id}
              className={!alert.read ? 'border-purple-500/20' : ''}
              onClick={() => !alert.read && markRead.mutate(alert.id)}
            >
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-purple-500/10 p-2">
                  <Icon className="h-5 w-5 text-purple-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">{alert.title}</h3>
                    {!alert.read && <Badge>New</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-zinc-400">{alert.message}</p>
                  <p className="mt-2 text-xs text-zinc-600">
                    {formatDistanceToNow(new Date(alert.triggeredAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            </GlassCard>
          )
        })}
      </div>
    </PageTransition>
  )
}

