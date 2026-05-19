import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { AnimatedCounter } from './AnimatedCounter'
import { cn } from '@/lib/utils'

interface MetricWidgetProps {
  label: string
  value: number
  prefix?: string
  suffix?: string
  change?: number
  decimals?: number
  icon: LucideIcon
  accent?: 'purple' | 'blue' | 'teal'
}

const accentMap = {
  purple: 'text-purple-400 bg-purple-500/10',
  blue: 'text-blue-400 bg-blue-500/10',
  teal: 'text-teal-400 bg-teal-500/10',
}

export function MetricWidget({
  label,
  value,
  prefix,
  suffix,
  change,
  decimals = 2,
  icon: Icon,
  accent = 'purple',
}: MetricWidgetProps) {
  return (
    <GlassCard className="relative overflow-hidden">
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br from-purple-500/10 to-transparent blur-2xl" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-white">
            <AnimatedCounter value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
          </p>
          {change !== undefined && (
            <p className={cn('mt-1 text-xs font-medium', change >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {change >= 0 ? '+' : ''}
              {change.toFixed(2)}%
            </p>
          )}
        </div>
        <motion.div
          whileHover={{ scale: 1.1, rotate: 5 }}
          className={cn('rounded-lg p-2.5', accentMap[accent])}
        >
          <Icon className="h-5 w-5" />
        </motion.div>
      </div>
    </GlassCard>
  )
}
