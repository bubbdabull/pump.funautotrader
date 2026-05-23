import type { PumpToken } from '@/types'
import { ingestPumpPortalPayload, pumpTokenFromMint } from '@/lib/probabilisticTrading'
import {
  pumpPortalWsUrl,
  useBrowserPumpPortalWs,
} from '@/lib/pumpportalConfig'
import { normalizePumpPortalTrade } from '@trading'
import type { TradeTickPayload } from '@/lib/tradeTypes'

type TokenHandler = (token: PumpToken) => void
type TradeTickHandler = (tick: TradeTickPayload) => void

/**
 * Optional browser PumpPortal WS — direct or hybrid mode.
 * Hybrid: trade stream for mints you watch; server still runs scan/autotrader.
 * https://pumpportal.fun/data-api/real-time
 */
class PumpPortalWebSocket {
  private ws: WebSocket | null = null
  private tokenHandlers = new Set<TokenHandler>()
  private updateHandlers = new Set<TokenHandler>()
  private tradeTickHandlers = new Set<TradeTickHandler>()
  private readonly tradeMints = new Set<string>()
  private reconnectMs = 5000

  private enabled() {
    return useBrowserPumpPortalWs()
  }

  connect() {
    if (!this.enabled()) return
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.ws = new WebSocket(pumpPortalWsUrl())

    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({ method: 'subscribeNewToken' }))
      this.ws?.send(JSON.stringify({ method: 'subscribeMigration' }))
      if (this.tradeMints.size) {
        this.ws?.send(
          JSON.stringify({
            method: 'subscribeTokenTrade',
            keys: [...this.tradeMints],
          }),
        )
      }
    }

    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as Record<string, unknown>
        if (!data.mint || typeof data.mint !== 'string') return

        const normalized = normalizePumpPortalTrade(data)
        if (normalized) {
          ingestPumpPortalPayload({
            ...data,
            txType: normalized.side,
            solAmount: normalized.solAmount,
            tokenAmount: normalized.tokenAmount,
            timestamp: normalized.timestampMs,
          })
          const token = pumpTokenFromMint(data.mint as string, data)
          const tick: TradeTickPayload = {
            mint: data.mint as string,
            signature: normalized.signature ?? `${normalized.timestampMs}`,
            wallet: normalized.traderPublicKey ?? 'unknown',
            side: normalized.side,
            solAmount: normalized.solAmount,
            tokenAmount: normalized.tokenAmount,
            timestampMs: normalized.timestampMs,
            slot: normalized.slot,
            marketCapUsd: token.marketCap,
            bondingCurvePercent: token.bondingCurvePercent,
            holders: token.holders,
          }
          this.tradeTickHandlers.forEach((h) => h(tick))
          this.updateHandlers.forEach((h) => h(token))
          return
        }

        ingestPumpPortalPayload(data)
        const token = pumpTokenFromMint(data.mint as string, data)
        this.tokenHandlers.forEach((h) => h(token))
      } catch {
        /* ignore parse errors */
      }
    }

    this.ws.onclose = () => {
      if (!this.enabled()) return
      setTimeout(() => this.connect(), this.reconnectMs)
    }
  }

  /** Subscribe PumpPortal trade stream for a mint (token page / chart). */
  watchTrades(mint: string) {
    if (!this.enabled() || !mint) return
    if (this.tradeMints.has(mint)) return
    this.tradeMints.add(mint)
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: [mint] }))
    } else {
      this.connect()
    }
  }

  onNewToken(handler: TokenHandler) {
    this.tokenHandlers.add(handler)
    if (this.enabled()) this.connect()
    return () => {
      this.tokenHandlers.delete(handler)
    }
  }

  onToken(handler: TokenHandler) {
    return this.onNewToken(handler)
  }

  onTokenUpdate(handler: TokenHandler) {
    this.updateHandlers.add(handler)
    if (this.enabled()) this.connect()
    return () => {
      this.updateHandlers.delete(handler)
    }
  }

  onTradeTick(handler: TradeTickHandler) {
    this.tradeTickHandlers.add(handler)
    if (this.enabled()) this.connect()
    return () => {
      this.tradeTickHandlers.delete(handler)
    }
  }

  disconnect() {
    this.ws?.close()
    this.ws = null
    this.tradeMints.clear()
  }
}

export const pumpPortalWs = new PumpPortalWebSocket()
