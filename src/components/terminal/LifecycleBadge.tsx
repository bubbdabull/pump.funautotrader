import { motion } from 'framer-motion'
import type { TokenLifecycleState } from '@/types'

const STYLES: Record<
  TokenLifecycleState,
  { label: string; className: string }
> = {
  NEW: { label: 'New', className: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40' },
  DISCOVERING: {
    label: 'Discovering',
    className: 'bg-blue-500/15 text-blue-300 border-blue-500/35',
  },
  MOMENTUM: {
    label: 'Momentum',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  },
  BREAKOUT: {
    label: 'Breakout',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
  },
  MIGRATION_WATCH: {
    label: 'Migrating',
    className: 'bg-purple-500/15 text-purple-300 border-purple-500/35',
  },
  MIGRATED: {
    label: 'Migrated',
    className: 'bg-violet-500/20 text-violet-200 border-violet-400/40',
  },
  DEAD: { label: 'Dead', className: 'bg-zinc-700/30 text-zinc-500 border-zinc-600/30' },
  RUGGED: { label: 'Rugged', className: 'bg-red-500/20 text-red-300 border-red-500/40' },
}

export function LifecycleBadge({
  state,
  compact = false,
}: {
  state?: TokenLifecycleState
  compact?: boolean
}) {
  if (!state) return null
  const s = STYLES[state] ?? STYLES.NEW
  return (
    <motion.span
      key={state}
      initial={{ scale: 0.92, opacity: 0.6 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`inline-flex shrink-0 items-center rounded border px-1.5 font-medium ${s.className} ${
        compact ? 'text-[10px] py-0' : 'text-xs py-0.5'
      }`}
    >
      {s.label}
    </motion.span>
  )
}
