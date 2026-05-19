import { motion } from 'framer-motion'
import {
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  ComposedChart,
} from 'recharts'
import { GlassCard } from '@/components/shared/GlassCard'
import { generateChartData } from '@/lib/mock-data'

interface TokenChartProps {
  mint?: string
}

export function TokenChart({ mint: _mint }: TokenChartProps) {
  const data = generateChartData(60)

  return (
    <GlassCard className="h-[380px]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-white">Price Chart</h3>
        <motion.div className="flex gap-2">
          {['1H', '4H', '1D', '1W'].map((t) => (
            <button
              key={t}
              className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-white/5 hover:text-white"
            >
              {t}
            </button>
          ))}
        </motion.div>
      </div>
      <ResponsiveContainer width="100%" height="85%">
        <ComposedChart data={data}>
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a855f7" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" hide />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: '#71717a', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={60}
            tickFormatter={(v: number) => `$${v.toFixed(6)}`}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(17,19,24,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke="#a855f7"
            fill="url(#priceGrad)"
            strokeWidth={2}
          />
          <Bar dataKey="volume" fill="#3b82f6" opacity={0.2} yAxisId={0} />
        </ComposedChart>
      </ResponsiveContainer>
    </GlassCard>
  )
}
