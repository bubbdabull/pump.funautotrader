import { useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'
import type { ProgressionPoint } from '@/lib/chartTypes'

export function ProgressionChart({
  points,
  metric = 'score',
}: {
  points?: ProgressionPoint[]
  metric?: 'score' | 'migration' | 'mcap' | 'buyPressure'
}) {
  const data = useMemo(() => {
    if (!points?.length) return []
    return points.map((p) => ({
      t: p.t,
      label: new Date(p.t).toLocaleTimeString(),
      score: p.score,
      migration: p.migrationProbability,
      mcap: p.mcap,
      buyPressure: p.buyPressure,
      burst: p.burstIgnition,
    }))
  }, [points])

  const key =
    metric === 'migration'
      ? 'migration'
      : metric === 'mcap'
        ? 'mcap'
        : metric === 'buyPressure'
          ? 'buyPressure'
          : 'score'

  if (!data.length) {
    return <p className="py-6 text-center text-xs text-zinc-500">Progression data streams with trades</p>
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <ComposedChart data={data}>
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#71717a' }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: '#71717a' }} width={36} />
        <Tooltip
          contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 11 }}
        />
        <Area type="monotone" dataKey={key} fill="rgba(45,212,191,0.12)" stroke="none" />
        <Line type="monotone" dataKey={key} stroke="#2dd4bf" dot={false} strokeWidth={2} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
