import { useQuery } from '@tanstack/react-query'
import { pumpportalApi } from '@/services/api'
import { API_BASE, apiConfigMisconfigured, backendLabel } from '@/lib/apiConfig'
import { useHybridPumpPortalWs } from '@/lib/pumpportalConfig'
import { useWsConnection } from '@/hooks/useWsConnection'

/** API health for status bar — does not open a second Socket.IO connection. */
export function useBackendStatus() {
  const socketConnected = useWsConnection()

  const statusQuery = useQuery({
    queryKey: ['pumpportal-status'],
    queryFn: () => pumpportalApi.status(),
    refetchInterval: 8000,
    retry: 1,
  })

  const apiReachable = statusQuery.isSuccess
  const pumpportalConnected = Boolean(statusQuery.data?.connected)
  const feedTokensOnServer =
    statusQuery.data?.feedTokens ??
    (statusQuery.data as { liveFeedCount?: number } | undefined)?.liveFeedCount ??
    0

  let statusLine = 'Connecting to API…'
  let statusTone: 'ok' | 'warn' | 'error' = 'warn'

  const hybridFallback = useHybridPumpPortalWs()

  if (statusQuery.isError) {
    statusTone = 'error'
    statusLine = hybridFallback
      ? `Fly API unreachable · browser PumpPortal hybrid active`
      : `Cannot reach API (${backendLabel()}) — try local server or VITE_PUMPPORTAL_HYBRID`
  } else if (apiReachable && pumpportalConnected) {
    statusTone = 'ok'
    const socketBit = socketConnected ? 'WS on' : 'WS off'
    statusLine =
      feedTokensOnServer > 0
        ? `Live · ${feedTokensOnServer} tokens · ${socketBit}`
        : `Live · waiting for tokens · ${socketBit}`
  } else if (apiReachable) {
    statusTone = 'warn'
    statusLine = 'API connected · live stream warming up'
  }

  return {
    apiReachable,
    pumpportalConnected,
    socketConnected,
    feedTokensOnServer,
    status: statusQuery.data,
    statusLine,
    statusTone,
    apiBase: API_BASE,
    backendHost: backendLabel(),
    configMisconfigured: apiConfigMisconfigured(),
    error: statusQuery.error,
    isLoading: statusQuery.isLoading,
  }
}
