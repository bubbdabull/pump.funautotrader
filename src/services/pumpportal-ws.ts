import type { PumpToken } from '@/types'
import { ingestPumpPortalPayload, pumpTokenFromMint } from '@/lib/probabilisticTrading'
import { pumpPortalWsUrl, useDirectPumpPortalWs } from '@/lib/pumpportalConfig'

type TokenHandler = (token: PumpToken) => void

/**
 * Optional direct PumpPortal WS (browser).
 * Default OFF — use server relay to comply with "one connection" rule:
 * https://pumpportal.fun/data-api/real-time
 */
class PumpPortalWebSocket {
  private ws: WebSocket | null = null
  private tokenHandlers = new Set<TokenHandler>()
  private updateHandlers = new Set<TokenHandler>()
  private reconnectMs = 5000

  private enabled() {
    return useDirectPumpPortalWs()
  }

  connect() {
    if (!this.enabled()) return
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.ws = new WebSocket(pumpPortalWsUrl())

    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({ method: 'subscribeNewToken' }))
      this.ws?.send(JSON.stringify({ method: 'subscribeMigration' }))
    }

    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as Record<string, unknown>
        if (!data.mint || typeof data.mint !== 'string') return

        ingestPumpPortalPayload(data)
        const token = pumpTokenFromMint(data.mint as string, data)
        const isTrade = data.txType === 'buy' || data.txType === 'sell'

        if (isTrade) {
          this.updateHandlers.forEach((h) => h(token))
        } else {
          this.tokenHandlers.forEach((h) => h(token))
        }
      } catch {
        /* ignore parse errors */
      }
    }

    this.ws.onclose = () => {
      if (!this.enabled()) return
      setTimeout(() => this.connect(), this.reconnectMs)
    }
  }

  onNewToken(handler: TokenHandler) {
    this.tokenHandlers.add(handler)
    if (this.enabled()) this.connect()
    return () => this.tokenHandlers.delete(handler)
  }

  onToken(handler: TokenHandler) {
    return this.onNewToken(handler)
  }

  onTokenUpdate(handler: TokenHandler) {
    this.updateHandlers.add(handler)
    if (this.enabled()) this.connect()
    return () => this.updateHandlers.delete(handler)
  }

  disconnect() {
    this.ws?.close()
    this.ws = null
  }
}

export const pumpPortalWs = new PumpPortalWebSocket()
