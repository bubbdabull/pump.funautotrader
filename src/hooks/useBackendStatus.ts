import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pumpportalApi } from '@/services/api'
import { wsService } from '@/services/websocket'
import { API_BASE, backendLabel } from '@/lib/apiConfig'

export function useBackendStatus() {
  const statusQuery = useQuery({
    queryKey: ['pumpportal-status'],
    queryFn: () => pumpportalApi.status(),
    refetchInterval: 8000,
    retry: 1,
  })

  const [socketConnected, setSocketConnected] = useState(false)

  useEffect(() => {
    const socket = wsService.connect()
    const onConnect = () => setSocketConnected(true)
    const onDisconnect = () => setSocketConnected(false)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onDisconnect)
    if (socket.connected) setSocketConnected(true)
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onDisconnect)
    }
  }, [])

  const apiReachable = statusQuery.isSuccess
  const pumpportalConnected = Boolean(statusQuery.data?.connected)
  const feedTokensOnServer = statusQuery.data?.feedTokens ?? 0

  let statusLine = 'Connecting to API…'
  let statusTone: 'ok' | 'warn' | 'error' = 'warn'

  if (statusQuery.isError) {
    statusTone = 'error'
    statusLine = `Cannot reach API (${backendLabel()})`
  } else if (apiReachable && pumpportalConnected) {
    statusTone = 'ok'
    statusLine = 'PumpPortal connected'
  } else if (apiReachable) {
    statusTone = 'warn'
    statusLine = 'API online · PumpPortal starting…'
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
    error: statusQuery.error,
    isLoading: statusQuery.isLoading,
  }
}
