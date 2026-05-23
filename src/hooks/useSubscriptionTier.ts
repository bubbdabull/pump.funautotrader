import { useMemo } from 'react'
import type { SubscriptionTier } from '@/types'

/** Monetization tier — set VITE_SUBSCRIPTION_TIER=pro for full realtime intel. */
export function useSubscriptionTier(): SubscriptionTier {
  return useMemo(() => {
    const env = import.meta.env.VITE_SUBSCRIPTION_TIER as string | undefined
    if (env === 'pro') return 'pro'
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('phronis_tier')
      if (stored === 'pro') return 'pro'
    }
    return 'free'
  }, [])
}
