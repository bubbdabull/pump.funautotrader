import { useEffect } from 'react'
import { realtimeGateway } from '@/services/realtime-gateway'

/** Ref-counted subscribe:token — one socket, shared across components. */
export function useTokenSubscription(mint: string | undefined) {
  useEffect(() => {
    if (!mint) return
    return realtimeGateway.subscribeToken(mint)
  }, [mint])
}
