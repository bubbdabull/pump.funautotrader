import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { useTokenChart } from '@/hooks/useRegistry'
import { useLiveTick, secondsSince, formatSecondsAgo } from '@/hooks/useLiveTick'
import {
  CHART_INTERVAL_OPTIONS,
  CHART_METRIC_OPTIONS,
  type ChartMetric,
  type OhlcvCandle,
} from '@/lib/chartTypes'
import { formatUsd, cn } from '@/lib/utils'

interface TradingChartProps {
  mint: string
  /** Terminal embed: compact toolbar, flex height, no duplicate panel chrome */
  variant?: 'full' | 'embed'
}

function volumeBarColor(c: OhlcvCandle, avgVol: number): string {
  const bullish = c.close >= c.open
  const spike = avgVol > 0 && c.volume > avgVol * 2.2
  const buyHeavy = c.buys >= c.sells * 1.35
  if (spike && buyHeavy) return 'rgba(74,222,128,0.92)'
  if (spike && !buyHeavy) return 'rgba(248,113,113,0.92)'
  return bullish ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'
}

function transformOhlc(candles: OhlcvCandle[], metric: ChartMetric): CandlestickData[] {
  let prevCurve = candles[0]?.curve ?? 0
  return candles.map((c) => {
    let open: number
    let high: number
    let low: number
    let close: number

    if (metric === 'mcap') {
      open = c.open
      high = c.high
      low = c.low
      close = c.close
    } else if (metric === 'price') {
      const div = 1_000_000_000
      open = c.open / div
      high = c.high / div
      low = c.low / div
      close = c.close / div
    } else {
      const cur = c.curve ?? prevCurve
      open = prevCurve || cur
      high = Math.max(open, cur)
      low = Math.min(open, cur)
      close = cur
      prevCurve = cur
    }

    return {
      time: Math.floor(c.t / 1000) as CandlestickData['time'],
      open,
      high,
      low,
      close,
    }
  })
}

function formatMetricValue(metric: ChartMetric, value: number): string {
  if (metric === 'mcap') return formatUsd(value)
  if (metric === 'price') {
    if (value >= 0.01) return `$${value.toFixed(4)}`
    if (value >= 0.0001) return `$${value.toFixed(6)}`
    return `$${value.toExponential(2)}`
  }
  return `${value.toFixed(1)}%`
}

export function TradingChart({ mint, variant = 'full' }: TradingChartProps) {
  const embed = variant === 'embed'
  const [intervalMs, setIntervalMs] = useState(1_000)
  const [metric, setMetric] = useState<ChartMetric>('mcap')
  const { data, isLoading } = useTokenChart(mint, intervalMs)
  const tick = useLiveTick()

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const lastBarSigRef = useRef('')
  const [tradePulse, setTradePulse] = useState(false)

  const candles = data?.candles ?? []
  const last = candles[candles.length - 1]
  const changePct = data?.changePct ?? 0
  const lastTradeSec = secondsSince(data?.lastTradeAt, tick)
  void tick

  const displayValue = useMemo(() => {
    if (metric === 'mcap') return data?.currentMcap ?? last?.close ?? 0
    if (metric === 'price') return data?.currentPriceUsd ?? (last?.priceUsd ?? 0)
    return data?.currentCurve ?? last?.curve ?? 0
  }, [metric, data, last])

  const candleSig = useMemo(() => {
    const tail = candles[candles.length - 1]
    if (!tail) return ''
    return `${candles.length}:${tail.t}:${tail.close}:${tail.volume}:${tail.buys}:${data?.chartSeq ?? 0}`
  }, [candles, data?.chartSeq])

  useEffect(() => {
    if (!candleSig) return
    setTradePulse(true)
    const t = window.setTimeout(() => setTradePulse(false), 380)
    return () => window.clearTimeout(t)
  }, [candleSig])

  const hasCanvas = candles.length > 0

  useEffect(() => {
    if (!hasCanvas) return
    if (!containerRef.current) return
    const el = containerRef.current
    const size = () => ({
      width: el.clientWidth,
      height: Math.max(el.clientHeight, embed ? 240 : 400),
    })

    const chart = createChart(el, {
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
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: true,
        secondsVisible: intervalMs < 60_000,
      },
      ...size(),
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#4ade80',
      wickDownColor: '#f87171',
    })
    const volume = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    })

    chartRef.current = chart
    candleRef.current = candleSeries
    volRef.current = volume

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions(size())
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volRef.current = null
      lastBarSigRef.current = ''
    }
  }, [intervalMs, embed, hasCanvas])

  useEffect(() => {
    if (!candleRef.current || !volRef.current || !candles.length) return

    let ohlc = transformOhlc(candles, metric)
    if (ohlc.length === 1) {
      const c = ohlc[0]
      const t0 = (c.time as number) - Math.max(1, Math.floor(intervalMs / 1000))
      ohlc = [{ ...c, time: t0 as CandlestickData['time'] }, c]
    }
    const avgVol =
      candles.reduce((sum, c) => sum + c.volume, 0) / Math.max(candles.length, 1)
    const vol: HistogramData[] = candles.map((c) => ({
      time: Math.floor(c.t / 1000) as HistogramData['time'],
      value: c.volume,
      color: volumeBarColor(c, avgVol),
    }))

    const lastBar = ohlc[ohlc.length - 1]
    const volBar = vol[vol.length - 1]
    const canIncremental = lastBarSigRef.current && candleSig !== lastBarSigRef.current

    if (canIncremental && lastBar && volBar) {
      candleRef.current.update(lastBar)
      volRef.current.update(volBar)
    } else {
      candleRef.current.setData(ohlc)
      volRef.current.setData(vol)
      if (!lastBarSigRef.current) chartRef.current?.timeScale().fitContent()
    }
    lastBarSigRef.current = candleSig
  }, [candleSig, metric, intervalMs, candles.length])

  const live = (data?.tradeCount ?? 0) > 0
  const streamOn = data?.tradeStreamSubscribed
  const hasKey = data?.pumpportalKeyConfigured !== false

  const toolbar = (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2',
        embed ? 'shrink-0 border-b border-white/[0.06] px-3 py-2' : 'mt-3',
      )}
    >
      <div className="flex rounded-lg border border-white/10 bg-black/30 p-0.5">
        {CHART_METRIC_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setMetric(opt.id)}
            className={cn(
              'rounded-md px-3 py-1 text-[10px] font-semibold uppercase tracking-wide transition',
              metric === opt.id
                ? 'bg-violet-600/90 text-white'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex rounded-lg border border-white/10 bg-black/30 p-0.5">
        {CHART_INTERVAL_OPTIONS.map((opt) => (
          <button
            key={opt.ms}
            type="button"
            onClick={() => setIntervalMs(opt.ms)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide transition',
              intervalMs === opt.ms
                ? 'bg-cyan-600/80 text-white'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {embed && (
        <div className="ml-auto flex items-center gap-2 font-mono text-[10px] text-zinc-500">
          {live && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
          )}
          <span className="text-violet-200">{formatMetricValue(metric, displayValue)}</span>
          {changePct !== 0 && (
            <span className={changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {changePct >= 0 ? '+' : ''}
              {changePct.toFixed(2)}%
            </span>
          )}
          {lastTradeSec != null && live && (
            <span className="text-zinc-600">· {formatSecondsAgo(lastTradeSec)}</span>
          )}
        </div>
      )}
      {!embed && last && metric === 'mcap' && (
        <div className="ml-auto hidden gap-3 font-mono text-[10px] text-zinc-500 sm:flex">
          <span>
            O <span className="text-zinc-300">{formatUsd(last.open)}</span>
          </span>
          <span>
            H <span className="text-emerald-400/90">{formatUsd(last.high)}</span>
          </span>
          <span>
            L <span className="text-red-400/90">{formatUsd(last.low)}</span>
          </span>
          <span>
            C <span className="text-violet-300">{formatUsd(last.close)}</span>
          </span>
        </div>
      )}
    </div>
  )

  const chartBody =
    isLoading && candles.length === 0 ? (
      <div
        className={cn(
          'animate-pulse bg-white/[0.02]',
          embed ? 'min-h-[240px] flex-1' : 'h-[400px]',
        )}
      />
    ) : candles.length === 0 ? (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 px-4 text-sm text-zinc-500',
          embed ? 'min-h-[240px] flex-1 terminal-warmup' : 'h-[400px]',
        )}
      >
        <p>{embed ? 'Warming up chart data…' : 'No candle data yet.'}</p>
        <p className="max-w-md text-center text-xs text-zinc-600">
          OHLC builds from trade:tick + bonding-curve updates. Active tokens populate within
          seconds.
        </p>
      </div>
    ) : (
      <div
        ref={containerRef}
        className={cn(
          'terminal-chart-canvas w-full',
          tradePulse && 'terminal-chart-trade-pulse',
          embed ? 'min-h-[240px] flex-1' : 'h-[min(42vh,440px)] min-h-[280px]',
        )}
      />
    )

  if (embed) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {toolbar}
        {chartBody}
      </div>
    )
  }

  return (
    <div className="panel overflow-hidden p-0">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Trading chart</h3>
              {live && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                  <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {live ? (
                <>
                  {data?.tradeCount ?? 0} trades
                  {lastTradeSec != null ? ` · last ${formatSecondsAgo(lastTradeSec)}` : ''}
                  {candles.length ? ` · ${candles.length} candles` : ''}
                </>
              ) : streamOn === false && hasKey ? (
                'Subscribing to trade stream…'
              ) : !hasKey ? (
                'Set PUMPPORTAL_API_KEY on Fly'
              ) : (
                'Waiting for trades — open a token with green pulse in feed'
              )}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1">
            <span className="font-mono text-lg font-semibold text-violet-200">
              {formatMetricValue(metric, displayValue)}
            </span>
            {changePct !== 0 && candles.length >= 2 && (
              <span
                className={cn(
                  'flex items-center gap-0.5 font-mono text-xs',
                  changePct >= 0 ? 'text-emerald-400' : 'text-red-400',
                )}
              >
                {changePct >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {changePct >= 0 ? '+' : ''}
                {changePct.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
        {toolbar}
      </div>
      {chartBody}
    </div>
  )
}
