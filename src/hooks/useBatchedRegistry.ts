import { useEffect, useRef, useState } from 'react'
import { useStreamStore } from '@/core/streamStore'

/** Throttle registry-driven UI repaints during WS bursts (100–250ms). */
export function useBatchedRegistryTick(intervalMs = 150): number {
  const version = useStreamStore((s) => s.version)
  const [tick, setTick] = useState(version)
  const latest = useRef(version)

  useEffect(() => {
    latest.current = version
  }, [version])

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => (latest.current !== t ? latest.current : t))
    }, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return tick
}
