import axios from 'axios'
import type { PumpToken, SmartWallet, AutoTradeRules, AutoTradeSignal, Alert } from '@/types'
import { ensureArray } from '@/lib/ensureArray'
import { API_BASE } from '@/lib/apiConfig'
import { normalizePumpToken, normalizePumpTokens } from '@/lib/normalizeToken'
import type { ScannerLane } from '@/lib/feedQuality'
import type { TokenChartSeries } from '@/lib/chartTypes'

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
  timestampMs: number
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
  feedTokens?: number
  liveFeedCount?: number
}

export const pumpportalApi = {
  status: () => api.get<PumpPortalStatus>('/pumpportal/status').then((r) => r.data),
}

export const tokenApi = {
  list: () => api.get('/tokens/feed').then((r) => ensureArray<PumpToken>(r.data)),
  get: (mint: string) =>
    api.get<PumpToken>(`/tokens/${mint}`).then((r) => normalizePumpToken(r.data)),
  feed: (lane: ScannerLane = 'all') =>
    api
      .get('/tokens/feed', { params: { lane } })
      .then((r) => normalizePumpTokens(ensureArray<PumpToken>(r.data))),
  graduating: () =>
    api.get('/tokens/graduating').then((r) => normalizePumpTokens(ensureArray<PumpToken>(r.data))),
  chart: (mint: string, intervalMs = 5_000) =>
    api
      .get<TokenChartSeries>(`/tokens/${mint}/chart`, { params: { interval: intervalMs } })
      .then((r) => r.data),
  watchTrades: (mint: string) =>
    api.post<{ mint: string; queued: boolean; subscribed: boolean; tradeCount: number }>(
      `/tokens/${mint}/watch-trades`,
    ).then((r) => r.data),
  stats: () => api.get<FeedStats>('/tokens/stats').then((r) => r.data),
  scanStats: () =>
    api
      .get<{
        liveFeedSize: number
        tradeableInLive: number
        tradeableInDiscovery: number
        discovery: {
          poolSize: number
          tradeableInPool: number
          lastScanAt?: string
          lastScanCount: number
        }
      }>('/tokens/scan/stats')
      .then((r) => r.data),
  discovery: (limit = 80) =>
    api.get('/tokens/discovery', { params: { limit } }).then((r) => ensureArray<PumpToken>(r.data)),
  trades: (mint: string) => api.get(`/tokens/${mint}/trades`).then((r) => ensureArray<FeedTrade>(r.data)),
}

export const walletApi = {
  list: () => api.get('/wallets/smart').then((r) => ensureArray<SmartWallet>(r.data)),
}

export interface ExecutionBuildResult {
  ok: boolean
  transaction?: string
  slippageUsed?: number
  priorityFee?: number
  positionSizeSol?: number
  latencyMs?: number
  error?: string
}

export const executionApi = {
  build: (body: {
    publicKey: string
    action: 'buy' | 'sell'
    mint: string
    amountSol: number
    slippage?: number
    priorityFee?: number
    pool?: string
    strategyId?: string
    evConfidence?: number
  }) => api.post<ExecutionBuildResult>('/execution/build', body).then((r) => r.data),
}

export const quantApi = {
  rankings: () =>
    api.get<{ mint: string; confidence: number }[]>('/quant/rankings').then((r) => r.data),
  analyze: (mint: string) => api.get(`/quant/analyze/${mint}`).then((r) => r.data),
}

export const riskApi = {
  state: () => api.get('/risk/state').then((r) => r.data),
  setConfig: (body: Record<string, number>) => api.put('/risk/config', body).then((r) => r.data),
}

export const backtestApi = {
  replay: (body: { events: unknown[]; latencyMs?: number; slippagePct?: number }) =>
    api.post('/backtest/replay', body).then((r) => r.data),
}

export const autoTraderApi = {
  getRules: () => api.get<AutoTradeRules>('/autotrader/rules').then((r) => r.data),
  setRules: (rules: Partial<AutoTradeRules>) =>
    api.put<AutoTradeRules>('/autotrader/rules', rules).then((r) => r.data),
  getSignals: () => api.get('/autotrader/signals').then((r) => ensureArray<AutoTradeSignal>(r.data)),
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
    api.get('/alerts').then((r) =>
      ensureArray<Alert>(r.data).map((a) => ({
        ...a,
        triggeredAt:
          typeof a.triggeredAt === 'string' ? a.triggeredAt : new Date(a.triggeredAt).toISOString(),
      })),
    ),
  markRead: (id: string) => api.patch(`/alerts/${id}/read`).then((r) => r.data),
}
