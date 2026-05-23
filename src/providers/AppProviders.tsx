import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { WalletProvider } from './WalletProvider'
import { useTerminalSync } from '@/hooks/useTerminalSync'
import { useRealtimeDiagnostics } from '@/hooks/useRealtimeDiagnostics'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

export function AppProviders({ children }: { children: ReactNode }) {
  useTerminalSync()
  useRealtimeDiagnostics()

  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>{children}</WalletProvider>
    </QueryClientProvider>
  )
}
