import { useEffect, useState } from 'react'

/** Re-render every second so relative timestamps and live labels stay fresh. */
export function useLiveTick(intervalMs = 1000): number {
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return tick
}

export function secondsSince(ms?: number, now = Date.now()): number | null {
  if (!ms) return null
  return Math.max(0, Math.round((now - ms) / 1000))
}

export function formatSecondsAgo(sec: number | null): string {
  if (sec == null) return '—'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.round(sec / 60)}m`
  return `${Math.round(sec / 3600)}h`
}
