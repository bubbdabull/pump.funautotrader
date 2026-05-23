import { memo, useMemo } from 'react'
import { useTokenRegistryStore } from '@/stores/tokenRegistryStore'
import { cn } from '@/lib/utils'

interface MicroSparklineProps {
  mint: string
  width?: number
  height?: number
  className?: string
}

function MicroSparklineInner({ mint, width = 56, height = 22, className }: MicroSparklineProps) {
  const series = useTokenRegistryStore((s) => s.charts[`${mint}::5000`])
  const points = useMemo(() => {
    const candles = series?.candles ?? []
    if (candles.length < 2) return null
    const slice = candles.slice(-24)
    const values = slice.map((c) => c.close)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const w = width - 2
    const h = height - 2
    const coords = values.map((v, i) => {
      const x = 1 + (i / Math.max(1, values.length - 1)) * w
      const y = 1 + h - ((v - min) / range) * h
      return `${x},${y}`
    })
    const up = values[values.length - 1]! >= values[0]!
    return { poly: coords.join(' '), up }
  }, [series?.chartSeq, series?.candles?.length, mint, width, height])

  if (!points) {
    return (
      <svg width={width} height={height} className={cn('opacity-30', className)} aria-hidden>
        <line x1={1} y1={height / 2} x2={width - 1} y2={height / 2} stroke="currentColor" strokeWidth={1} />
      </svg>
    )
  }

  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <polyline
        fill="none"
        stroke={points.up ? '#34d399' : '#f87171'}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.poly}
      />
    </svg>
  )
}

export const MicroSparkline = memo(MicroSparklineInner)
