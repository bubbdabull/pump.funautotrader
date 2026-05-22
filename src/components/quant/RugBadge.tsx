import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuantStore } from '@/stores/quantStore'

interface RugBadgeProps {
  mint: string
  compact?: boolean
}

export function RugBadge({ mint, compact }: RugBadgeProps) {
  const rug = useQuantStore((s) => s.byMint[mint]?.rug)
  if (!rug) return null

  const blocked = rug.blocked || rug.rugScore >= 0.72
  const warn = !blocked && rug.rugScore >= 0.45

  if (!blocked && !warn) {
    if (compact) return null
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
        <ShieldCheck className="h-3 w-3" />
        OK
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase',
        blocked ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/15 text-amber-300',
      )}
      title={rug.reasons.join(', ')}
    >
      <ShieldAlert className="h-3 w-3" />
      {blocked ? 'Rug' : 'Risk'} {Math.round(rug.rugScore * 100)}
    </span>
  )
}
