import { memo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { TradingChart } from '@/components/charts/TradingChart'
import { TokenImage } from '@/components/shared/TokenImage'
import { tokenMediaProps } from '@/lib/tokenMediaProps'
import { displayTokenName, displayTokenSymbol } from '@/lib/tokenDisplay'
import { LifecycleBadge } from '@/components/terminal/LifecycleBadge'
import { HolderBubbleMap } from '@/components/terminal/HolderBubbleMap'
import { PhotonTxTable } from '@/components/terminal/photon/PhotonTxTable'
import { useStreamStore } from '@/core/streamStore'
import { cn, formatUsd, formatSol, tokenVolumeSol, shortenAddress } from '@/lib/utils'
import type { PumpToken } from '@/types'

type CenterTab = 'transactions' | 'holders' | 'traders'

interface PhotonCenterPanelProps {
  token?: PumpToken
  mint: string
}

function PhotonCenterPanelInner({ token, mint }: PhotonCenterPanelProps) {
  const [tab, setTab] = useState<CenterTab>('transactions')
  const graph = useStreamStore((s) => (mint ? s.walletGraphs[mint] : undefined))

  if (!token || !mint) {
    return (
      <div className="photon-panel flex h-full flex-col items-center justify-center gap-2">
        <p className="text-sm text-zinc-500">Select a token from the watchlist</p>
        <p className="text-[11px] text-zinc-600">Live chart · trades · holder map</p>
      </div>
    )
  }

  const change = token.mcapChange5m ?? token.priceChange24h
  const vol5 = token.volume5mSol ?? 0
  const buys = token.buyPressure1m != null ? Math.round((token.buyPressure1m / 100) * (token.trades1m ?? 1)) : 0
  const sells = Math.max(0, (token.trades1m ?? 0) - buys)

  return (
    <div className="photon-panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-white/[0.05] px-3 py-2.5">
        <div className="flex items-start gap-3">
          <TokenImage {...tokenMediaProps(token)} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">
                ${displayTokenSymbol(token)}
              </h1>
              <LifecycleBadge state={token.lifecycle} compact />
              <span className="rounded bg-[#1a3d32]/80 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-400">
                pump.fun
              </span>
            </div>
            <p className="truncate text-[11px] text-zinc-500">{displayTokenName(token)}</p>
            <a
              href={`https://solscan.io/token/${mint}`}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 font-mono text-[10px] text-zinc-600 hover:text-emerald-400"
            >
              {shortenAddress(mint, 6)}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
          <div className="text-right">
            <p className="font-mono text-xl font-semibold text-white">
              MC {formatUsd(token.marketCap)}
            </p>
            <p
              className={cn(
                'font-mono text-sm',
                change >= 0 ? 'text-emerald-400' : 'text-red-400',
              )}
            >
              {change >= 0 ? '+' : ''}
              {change.toFixed(2)}% 5m
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/[0.06] bg-white/[0.03] sm:grid-cols-4 lg:grid-cols-6">
          {[
            ['Price USD', formatUsd(token.priceUsd > 0 ? token.priceUsd : token.marketCap / 1e9)],
            ['Liquidity', formatSol(token.liquidity || tokenVolumeSol(token) * 0.1)],
            ['MKT Cap', formatUsd(token.marketCap)],
            ['Curve', `${token.bondingCurvePercent.toFixed(1)}%`],
            ['Vol 5m', `${vol5.toFixed(2)} SOL`],
            ['Holders', String(token.holders)],
          ].map(([k, v]) => (
            <div key={k} className="bg-[#0a0a0c] px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-wider text-zinc-600">{k}</p>
              <p className="truncate font-mono text-[11px] text-zinc-200">{v}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 rounded-md border border-white/[0.05] bg-black/40 px-2 py-1.5 text-center sm:grid-cols-6">
          {[
            ['TXNS', String(token.trades1m ?? 0)],
            ['Buys', String(buys)],
            ['Sells', String(sells)],
            ['Volume', formatSol(vol5)],
            ['Buy %', token.buyPressure1m != null ? `${token.buyPressure1m}%` : '—'],
            ['Signal', String(token.signalScore ?? '—')],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-[8px] uppercase text-zinc-600">{k}</p>
              <p className="font-mono text-[10px] text-zinc-300">{v}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-[220px] shrink-0 border-b border-white/[0.05] lg:min-h-[280px] lg:flex-[1.1]">
          <TradingChart mint={mint} variant="embed" />
        </div>

        <div className="flex shrink-0 border-b border-white/[0.05]">
          {(
            [
              ['transactions', 'Transactions'],
              ['holders', 'Holders'],
              ['traders', 'Bubblemaps'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'border-b-2 px-4 py-2 text-[11px] font-semibold transition-colors',
                tab === id
                  ? 'border-emerald-400 text-emerald-400'
                  : 'border-transparent text-zinc-600 hover:text-zinc-400',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-[140px] flex-1 overflow-hidden lg:min-h-[180px]">
          {tab === 'transactions' && <PhotonTxTable mint={mint} />}
          {tab === 'holders' && (
            <div className="h-full overflow-auto p-2">
              <HolderBubbleMap graph={graph} token={token} />
            </div>
          )}
          {tab === 'traders' && (
            <div className="photon-warmup flex h-full items-center justify-center p-4 text-[11px] text-zinc-500">
              Wallet graph streams when enrichment completes
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const PhotonCenterPanel = memo(
  PhotonCenterPanelInner,
  (a, b) => a.mint === b.mint && a.token?.updatedAt === b.token?.updatedAt,
)
