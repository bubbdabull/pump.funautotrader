import type { StreamToken } from '@/domain/tokens/tokenTypes'
import { formatUsd, formatHolders, cn } from '@/lib/utils'
import { ExternalLink } from 'lucide-react'

interface TokenDetailPanelProps {
  token: StreamToken | null
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex justify-between gap-2 py-1 text-[11px]">
      <span className="text-zinc-500">{label}</span>
      <span
        className={cn(
          'font-mono text-right',
          ok === true && 'text-emerald-400',
          ok === false && 'text-amber-400',
          ok === undefined && 'text-zinc-200',
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function TokenDetailPanel({ token }: TokenDetailPanelProps) {
  if (!token) {
    return (
      <div className="desk-panel flex flex-1 items-center justify-center p-4 text-xs text-zinc-600">
        Select a token from the live feed
      </div>
    )
  }

  const socials = [
    token.twitter && { label: 'Twitter', href: token.twitter },
    token.telegram && { label: 'Telegram', href: token.telegram },
    token.website && { label: 'Web', href: token.website },
  ].filter(Boolean) as { label: string; href: string }[]

  return (
    <div className="desk-panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-white/10 px-3 py-2">
        <h2 className="text-sm font-bold text-white">
          {token.symbol}
          <span className="ml-2 text-xs font-normal text-zinc-500">{token.displayStatus}</span>
        </h2>
        <p className="truncate text-[10px] text-zinc-500">{token.mint}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <Row label="Market cap" value={formatUsd(token.marketCap)} />
        <Row label="Price" value={token.livePriceUsd > 0 ? formatUsd(token.livePriceUsd) : '—'} />
        <Row label="Liquidity" value={formatUsd(token.liquidity)} />
        <Row label="Volume 5m" value={`${(token.volume5mSol ?? 0).toFixed(2)} SOL`} />
        <Row label="Holders" value={formatHolders(token.holders, token.holdersVerified)} />
        <Row label="Curve" value={`${token.bondingCurvePercent.toFixed(1)}%`} />
        <Row label="Intel score" value={String(Math.round(token.intelScore))} ok={token.intelScore >= 55} />
        <Row label="Momentum" value={String(token.momentumScore)} />
        <Row label="Buy pressure" value={token.buyPressure1m != null ? `${token.buyPressure1m}%` : '—'} />
        <Row
          label="Migration"
          value={token.migrationProbability != null ? `${token.migrationProbability}%` : '—'}
        />
        {token.smartMoneyFlow && token.smartMoneyFlow !== 'NEUTRAL' && (
          <Row label="Smart money" value={token.smartMoneyFlow.replace(/_/g, ' ')} />
        )}
        {socials.length > 0 && (
          <div className="mt-3 border-t border-white/5 pt-2">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">Social</p>
            {socials.map((s) => (
              <a
                key={s.href}
                href={s.href.startsWith('http') ? s.href : `https://${s.href}`}
                target="_blank"
                rel="noreferrer"
                className="mb-1 flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300"
              >
                <ExternalLink className="h-3 w-3" />
                {s.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
