import type { OhlcvCandle } from '../tokens/chart.types'
import type { ProgressionPoint } from '../events/terminal-payloads'

export interface ChartIntervalDelta {
  candle: OhlcvCandle
  closed?: OhlcvCandle
  isNewBucket?: boolean
}

/** Incremental chart push — one active candle patch per timeframe. */
export interface ChartUpdatePayload {
  v: 2
  mint: string
  seq: number
  emittedAt: number
  intervals: Record<number, ChartIntervalDelta>
  currentMcap: number
  currentPriceUsd: number
  currentCurve: number
  changePct: number
  tradeCount: number
  lastTradeAt?: number
  buyPressure?: number
  volumeVelocity?: number
  priceVelocity?: number
  progressionPoint?: ProgressionPoint
}

export function isChartUpdatePayload(payload: unknown): payload is ChartUpdatePayload {
  return (
    Boolean(payload) &&
    typeof payload === 'object' &&
    (payload as ChartUpdatePayload).v === 2 &&
    typeof (payload as ChartUpdatePayload).mint === 'string' &&
    typeof (payload as ChartUpdatePayload).intervals === 'object'
  )
}
