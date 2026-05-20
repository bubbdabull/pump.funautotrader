import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { alertApi } from '@/services/api'
import type { Alert } from '@/types'
import { ensureArray } from '@/lib/ensureArray'

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: () => alertApi.list(),
    refetchInterval: 15_000,
    staleTime: 5_000,
  })
}

export function useMarkAlertRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => alertApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
    },
  })
}

export function useUnreadAlertCount(alerts: Alert[] | undefined) {
  return ensureArray<Alert>(alerts).filter((a) => !a.read).length
}
