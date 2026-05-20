import axios from 'axios'
import type { PumpToken, SmartWallet, AutoTradeRules, AutoTradeSignal, Alert } from '@/types'

import { API_BASE } from '@/lib/apiConfig'

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
})

export interface FeedTrade {
  signature: string
  wallet: string
  side: 'buy' | 'sell'
  solAmount: number
  tokenAmount: number
  timestamp: string
}

export interface FeedStats {
  activeTokens: number
  totalVolume24h: number
  totalMarketCap: number
  newTokensLastHour: number
  avgSignalScore: number
}

export interface PumpPortalStatus {
  connected: boolean
  apiKeyConfigured: boolean
  tradeSubscriptionsEnabled: boolean
  messagesReceived: number
  lastMessageAt?: string
  subscribedTradeMints: number
  feedTokens: number
}

export const pumpportalApi = {
  status: () => api.get<PumpPortalStatus>('/pumpportal/status').then((r) => r.data),
}

export const tokenApi = {
  list: () => api.get<PumpToken[]>('/tokens/feed').then((r) => r.data),
  get: (mint: string) => api.get<PumpToken>(`/tokens/${mint}`).then((r) => r.data),
  feed: () => api.get<PumpToken[]>('/tokens/feed').then((r) => r.data),
  stats: () => api.get<FeedStats>('/tokens/stats').then((r) => r.data),
  trades: (mint: string) => api.get<FeedTrade[]>(`/tokens/${mint}/trades`).then((r) => r.data),
}

export const walletApi = {
  list: () => api.get<SmartWallet[]>('/wallets/smart').then((r) => r.data),
}

export const autoTraderApi = {
  getRules: () => api.get<AutoTradeRules>('/autotrader/rules').then((r) => r.data),
  setRules: (rules: Partial<AutoTradeRules>) =>
    api.put<AutoTradeRules>('/autotrader/rules', rules).then((r) => r.data),
  getSignals: () => api.get<AutoTradeSignal[]>('/autotrader/signals').then((r) => r.data),
}

export const tradeApi = {
  record: (body: {
    mint: string
    side: 'buy' | 'sell'
    amountSol: number
    wallet: string
    txSig?: string
  }) => api.post('/trade/record', body).then((r) => r.data),
}

export const alertApi = {
  list: () =>
    api.get<Alert[]>('/alerts').then((r) =>
      r.data.map((a) => ({
        ...a,
        triggeredAt:
          typeof a.triggeredAt === 'string' ? a.triggeredAt : new Date(a.triggeredAt).toISOString(),
      })),
    ),
  markRead: (id: string) => api.patch(`/alerts/${id}/read`).then((r) => r.data),
}
