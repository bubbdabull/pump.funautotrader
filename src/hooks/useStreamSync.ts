import { useEffect } from 'react'
import { startSocketClient } from '@/core/socketClient'

/** Mount once at app root — wires Socket.IO → streamStore */
export function useStreamSync() {
  useEffect(() => startSocketClient(), [])
}
