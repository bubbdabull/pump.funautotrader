import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { WalletProvider } from './WalletProvider'
import { useStreamSync } from '@/hooks/useStreamSync'
import { useRealtimeDiagnostics } from '@/hooks/useRealtimeDiagnostics'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

export function AppProviders({ children }: { children: ReactNode }) {
  useStreamSync()
  useRealtimeDiagnostics()

  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>{children}</WalletProvider>
    </QueryClientProvider>
  )
}
