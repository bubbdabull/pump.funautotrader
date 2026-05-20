import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useEffect } from 'react'
import { WalletProvider } from './WalletProvider'
import { wsService } from '@/services/websocket'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    wsService.connect()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>{children}</WalletProvider>
    </QueryClientProvider>
  )
}
