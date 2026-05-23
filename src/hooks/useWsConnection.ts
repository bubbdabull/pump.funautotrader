import { useEffect, useState } from 'react'
import { wsService } from '@/services/websocket'
import { useTokenRegistryStore } from '@/stores/tokenRegistryStore'

/** Tracks Socket.IO connection — registry patches only apply when live. */
export function useWsConnection(): boolean {
  const storeConnected = useTokenRegistryStore((s) => s.wsConnected)
  const [connected, setConnected] = useState(() => wsService.connected || storeConnected)

  useEffect(() => {
    wsService.connect()
    const unsubOn = wsService.onConnect(() => setConnected(true))
    const unsubOff = wsService.onDisconnect(() => setConnected(false))
    setConnected(wsService.connected)
    return () => {
      unsubOn()
      unsubOff()
    }
  }, [])

  return connected || storeConnected
}
