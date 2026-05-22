import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts'
import { useTokenChart } from '@/hooks/useScanner'
import { CHART_INTERVAL_OPTIONS } from '@/lib/chartTypes'
import { formatUsd } from '@/lib/utils'

interface DexScreenerChartProps {
  mint: string
}

export function DexScreenerChart({ mint }: DexScreenerChartProps) {
  const [intervalMs, setIntervalMs] = useState(5_000)
  const { data, isLoading } = useTokenChart(mint, intervalMs)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0b0f' },
        textColor: '#a1a1aa',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: true,
        secondsVisible: intervalMs < 60_000,
      },
      width: containerRef.current.clientWidth,
      height: 380,
    })

    const candles = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })
    const volume = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    })

    chartRef.current = chart
    candleRef.current = candles
    volRef.current = volume

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volRef.current = null
    }
  }, [intervalMs])

  useEffect(() => {
    const candles = data?.candles ?? []
    if (!candleRef.current || !volRef.current || !candles.length) return

    const ohlc: CandlestickData[] = candles.map((c) => ({
      time: Math.floor(c.t / 1000) as CandlestickData['time'],
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))
    const vol: HistogramData[] = candles.map((c) => ({
      time: Math.floor(c.t / 1000) as HistogramData['time'],
      value: c.volume,
      color: c.close >= c.open ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)',
    }))

    candleRef.current.setData(ohlc)
    volRef.current.setData(vol)
    chartRef.current?.timeScale().fitContent()
  }, [data?.candles])

  const candles = data?.candles ?? []
  const last = candles[candles.length - 1]
  const live = (data?.tradeCount ?? 0) > 0

  return (
    <div className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Live chart</h3>
          <p className="text-[11px] text-zinc-500">
            {live ? (
              <>
                {data?.tradeCount ?? 0} trades
                {data?.lastTradeAt
                  ? ` · last ${Math.max(0, Math.round((Date.now() - data.lastTradeAt) / 1000))}s ago`
                  : ''}
              </>
            ) : (
              'Waiting for trade stream — open token pins PumpPortal subscription'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {last && (
            <span className="font-mono text-sm text-violet-300">{formatUsd(last.close)}</span>
          )}
          <div className="flex rounded-lg border border-white/10 bg-white/[0.02] p-0.5">
            {CHART_INTERVAL_OPTIONS.map((opt) => (
              <button
                key={opt.ms}
                type="button"
                onClick={() => setIntervalMs(opt.ms)}
                className={`rounded-md px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide transition ${
                  intervalMs === opt.ms
                    ? 'bg-violet-600/80 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && candles.length === 0 ? (
        <div className="h-[380px] animate-pulse rounded-lg bg-white/[0.02]" />
      ) : candles.length === 0 ? (
        <div className="flex h-[380px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 text-sm text-zinc-500">
          <p>Candles appear when trades stream in for this mint.</p>
          <p className="text-xs text-zinc-600">
            Ensure PUMPPORTAL_API_KEY is set on the API — trade ticks build OHLCV every second.
          </p>
        </div>
      ) : (
        <div ref={containerRef} className="w-full overflow-hidden rounded-lg" />
      )}
    </div>
  )
}
