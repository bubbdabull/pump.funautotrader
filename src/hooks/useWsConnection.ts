import { useEffect, useState } from 'react'
import { wsService } from '@/services/websocket'

/** Tracks Socket.IO connection — feed patches only apply when this is true. */
export function useWsConnection(): boolean {
  const [connected, setConnected] = useState(() => wsService.connected)

  useEffect(() => {
    const socket = wsService.connect()
    const on = () => setConnected(true)
    const off = () => setConnected(false)
    socket.on('connect', on)
    socket.on('disconnect', off)
    socket.on('connect_error', off)
    if (socket.connected) setConnected(true)
    return () => {
      socket.off('connect', on)
      socket.off('disconnect', off)
      socket.off('connect_error', off)
    }
  }, [])

  return connected
}
