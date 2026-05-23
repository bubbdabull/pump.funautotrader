import { memo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useRegistryTrades } from '@/hooks/useRegistry'
import { cn, formatSol, shortenAddress } from '@/lib/utils'

interface PhotonTxTableProps {
  mint: string
  maxRows?: number
}

function PhotonTxTableInner({ mint, maxRows = 40 }: PhotonTxTableProps) {
  const { data: trades } = useRegistryTrades(mint)
  const list = trades.slice(0, maxRows)

  if (!mint) {
    return <p className="py-8 text-center text-[11px] text-zinc-600">Select a token</p>
  }

  if (list.length === 0) {
    return (
      <div className="photon-warmup py-10 text-center text-[11px] text-zinc-500">
        Waiting for live transactions…
      </div>
    )
  }

  return (
    <div className="min-h-0 overflow-auto">
      <table className="photon-table w-full">
        <thead className="sticky top-0 z-10 bg-[#0a0a0c]">
          <tr>
            <th>Date</th>
            <th>Age</th>
            <th>Type</th>
            <th className="text-right">Total SOL</th>
            <th className="text-right">Maker</th>
          </tr>
        </thead>
        <tbody>
          {list.map((t) => {
            const ms = t.timestampMs ?? new Date(t.timestamp).getTime()
            return (
              <tr key={t.signature} className={t.side === 'buy' ? 'photon-row-buy' : 'photon-row-sell'}>
                <td className="font-mono text-[10px] text-zinc-500">
                  {new Date(ms).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </td>
                <td className="text-[10px] text-zinc-600">
                  {formatDistanceToNow(ms, { addSuffix: true })}
                </td>
                <td>
                  <span
                    className={cn(
                      'text-[10px] font-bold uppercase',
                      t.side === 'buy' ? 'text-emerald-400' : 'text-red-400',
                    )}
                  >
                    {t.side}
                  </span>
                </td>
                <td className="text-right font-mono text-[11px] text-zinc-300">
                  {formatSol(t.solAmount)}
                </td>
                <td className="text-right font-mono text-[10px] text-zinc-600">
                  {shortenAddress(t.wallet, 3)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export const PhotonTxTable = memo(PhotonTxTableInner)
