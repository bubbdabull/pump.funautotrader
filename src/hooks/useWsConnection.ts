import { useStreamStore } from '@/core/streamStore'
import { useRealtimeStore } from '@/stores/realtimeStore'

/** Socket.IO live — driven by useTerminalSync + realtime gateway. */
export function useWsConnection(): boolean {
  const storeConnected = useStreamStore((s) => s.wsConnected)
  const rtConnected = useRealtimeStore((s) => s.connected)
  return storeConnected || rtConnected
}

export function useWsReconnecting(): boolean {
  return useRealtimeStore((s) => s.reconnecting)
}
