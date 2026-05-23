import { useMemo } from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format } from 'date-fns'
import { useTokenChart } from '@/hooks/useRegistry'
import { formatUsd } from '@/lib/utils'

interface ProTokenChartProps {
  mint: string
}

export function ProTokenChart({ mint }: ProTokenChartProps) {
  const { data, isLoading } = useTokenChart(mint)

  const chartData = useMemo(() => {
    if (!data?.points.length) return []
    return data.points.map((p) => ({
      time: p.t,
      label: format(p.t, 'HH:mm:ss'),
      mcap: p.price,
      priceUsd: p.priceUsd ?? p.price / 1_000_000_000,
      volume: p.volume,
      curve: p.curve,
    }))
  }, [data])

  if (isLoading) {
    return <div className="panel h-[420px] animate-pulse bg-white/[0.02]" />
  }

  if (!chartData.length) {
    return (
      <div className="panel flex h-[420px] items-center justify-center text-sm text-zinc-500">
        Chart data populates as trades stream in…
      </div>
    )
  }

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Market structure</h3>
          <p className="text-[11px] text-zinc-500">Live mcap · volume · bonding curve</p>
        </div>
        <div className="flex gap-3 text-[10px] uppercase tracking-wider text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-violet-500" /> MCap
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-cyan-500/60" /> Vol
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Curve %
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={chartData}>
          <defs>
            <linearGradient id="mcapFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={28} />
          <YAxis
            yAxisId="mcap"
            tick={{ fill: '#a1a1aa', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(v: number) => formatUsd(v)}
          />
          <YAxis yAxisId="curve" orientation="right" domain={[0, 100]} tick={{ fill: '#fbbf24', fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            contentStyle={{
              background: 'rgba(10,11,15,0.96)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              fontSize: 11,
            }}
            formatter={(value, name) => {
              const v = Number(value ?? 0)
              if (name === 'mcap') return [formatUsd(v), 'MCap']
              if (name === 'volume') return [`${v.toFixed(3)} SOL`, 'Volume']
              return [`${v}%`, 'Curve']
            }}
          />
          <Bar yAxisId="mcap" dataKey="volume" fill="#22d3ee" fillOpacity={0.35} barSize={6} />
          <Area yAxisId="mcap" type="monotone" dataKey="mcap" stroke="#8b5cf6" fill="url(#mcapFill)" strokeWidth={2} dot={false} />
          <Line yAxisId="curve" type="monotone" dataKey="curve" stroke="#fbbf24" strokeWidth={1.5} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
