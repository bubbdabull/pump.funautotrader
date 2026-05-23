export function MetricBar({
  label,
  value,
  max = 100,
  tone = 'teal',
}: {
  label: string
  value: number
  max?: number
  tone?: 'teal' | 'emerald' | 'amber' | 'purple' | 'red'
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const fill =
    tone === 'emerald'
      ? 'bg-emerald-500'
      : tone === 'amber'
        ? 'bg-amber-500'
        : tone === 'purple'
          ? 'bg-purple-500'
          : tone === 'red'
            ? 'bg-red-500'
            : 'bg-teal-500'
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] text-zinc-500">
        <span>{label}</span>
        <span className="font-mono text-zinc-400">{Math.round(value)}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full transition-all duration-300 ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
