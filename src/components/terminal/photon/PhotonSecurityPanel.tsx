import { cn } from '@/lib/utils'
import { formatUsd, formatHolders } from '@/lib/utils'
import type { PumpToken } from '@/types'

interface PhotonSecurityPanelProps {
  token?: PumpToken
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-[11px]">
      <span className="text-zinc-500">{label}</span>
      <span
        className={cn(
          'font-mono text-right',
          ok === true && 'text-emerald-400',
          ok === false && 'text-amber-400',
          ok === undefined && 'text-zinc-300',
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function PhotonSecurityPanel({ token }: PhotonSecurityPanelProps) {
  if (!token) {
    return (
      <div className="photon-panel flex flex-1 flex-col">
        <div className="photon-panel-header">Data & Security</div>
        <div className="photon-warmup flex flex-1 items-center justify-center p-4 text-[11px] text-zinc-600">
          Select a token
        </div>
      </div>
    )
  }

  const top10 = token.top5Pct != null ? (token.top5Pct > 1 ? token.top5Pct : token.top5Pct * 100) : null
  const issues =
    ((token.signalScore ?? 50) > 70 ? 1 : 0) + (!token.holdersVerified ? 1 : 0)

  return (
    <div className="photon-panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="photon-panel-header flex items-center justify-between">
        <span>Data & Security</span>
        {issues > 0 && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
            {issues} {issues === 1 ? 'Issue' : 'Issues'}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        <Row label="Holders verified" value={token.holdersVerified ? 'Yes' : 'Enriching…'} ok={token.holdersVerified} />
        <Row label="Holder count" value={formatHolders(token.holders, token.holdersVerified)} />
        <Row
          label="Top 10 hold"
          value={top10 != null ? `${top10.toFixed(1)}%` : '—'}
          ok={top10 != null ? top10 < 35 : undefined}
        />
        <Row label="Bonding curve" value={`${token.bondingCurvePercent.toFixed(1)}%`} />
        <Row label="Market cap" value={formatUsd(token.marketCap)} />
        <Row label="Signal score" value={String(token.signalScore ?? '—')} ok={(token.signalScore ?? 50) <= 62} />
        <Row label="Momentum" value={String(token.momentumScore ?? '—')} />
        {token.dataState && (
          <Row label="Data state" value={token.dataState} ok={token.dataState === 'active'} />
        )}
      </div>
    </div>
  )
}
