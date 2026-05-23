import { io, type Socket } from 'socket.io-client'
import type { PumpToken } from '@/types'
import type { TradeTickPayload } from '@/lib/tradeTypes'
import type {
  BubbleMapUpdatePayload,
  HolderUpdatePayload,
  MigrationUpdatePayload,
  SignalUpdatePayload,
  TokenStateChangePayload,
  WalletUpdatePayload,
} from '@/lib/terminalTypes'
import { REALTIME_EVENTS, type RealtimeEventName } from '@/lib/realtimeEvents'
import { registryDebug } from '@/lib/registryDebug'
import { useRealtimeStore } from '@/stores/realtimeStore'
import { WS_URL } from '@/lib/apiConfig'

type Handler<T> = (payload: T) => void

const MAX_PATCH_BUFFER = 500
const MAX_TOKEN_SUBS = 64

function parseFeedSnapshot(payload: unknown): PumpToken[] {
  if (Array.isArray(payload)) return payload as PumpToken[]
  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { tokens?: unknown }).tokens)
  ) {
    return (payload as { tokens: PumpToken[] }).tokens
  }
  return []
}

function warnLegacyEvent(name: string) {
  if (import.meta.env.DEV) {
    console.warn(`[realtime] ignored legacy event "${name}" — use canonical stream events`)
  }
}

/**
 * Single Socket.IO connection for the entire app.
 * Components must subscribe via hooks; never call io() elsewhere.
 */
class RealtimeGateway {
  private socket: Socket | null = null
  private listenersAttached = false
  private started = false
  private awaitingReconnectSnapshot = false

  private readonly patchHandlers = new Set<Handler<PumpToken>>()
  private readonly reconnectSnapshotHandlers = new Set<Handler<PumpToken[]>>()
  private readonly tradeHandlers = new Set<Handler<TradeTickPayload>>()
  private readonly chartHandlers = new Set<Handler<unknown>>()
  private readonly stateHandlers = new Set<Handler<TokenStateChangePayload>>()
  private readonly signalHandlers = new Set<Handler<SignalUpdatePayload>>()
  private readonly migrationHandlers = new Set<Handler<MigrationUpdatePayload>>()
  private readonly holderHandlers = new Set<Handler<HolderUpdatePayload>>()
  private readonly walletHandlers = new Set<Handler<WalletUpdatePayload>>()
  private readonly bubblemapHandlers = new Set<Handler<BubbleMapUpdatePayload>>()
  private readonly connectHandlers = new Set<Handler<void>>()
  private readonly disconnectHandlers = new Set<Handler<void>>()

  private readonly patchBuffer: PumpToken[] = []
  private readonly tokenRefCounts = new Map<string, number>()

  private latencySum = 0
  private latencySamples = 0

  private wsUrl(): string {
    if (WS_URL) return WS_URL
    if (typeof window !== 'undefined') return window.location.origin
    return 'http://localhost:5173'
  }

  /** Idempotent — safe to call from any hook; only creates one socket. */
  start() {
    if (this.started && this.socket) {
      if (this.socket.connected) this.resubscribeAll()
      return this.socket
    }
    this.started = true

    if (this.socket) {
      if (import.meta.env.DEV) {
        console.error('[realtime] duplicate start() — socket already exists')
      }
      useRealtimeStore.getState().patchDiagnostics({ socketInstances: 1 })
      return this.socket
    }

    const url = this.wsUrl()
    this.socket = io(url, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 15_000,
      timeout: 20_000,
    })

    useRealtimeStore.getState().patchDiagnostics({ socketInstances: 1 })
    this.attachSocket(this.socket)

    if (this.socket.connected) {
      this.onSocketConnected()
    }

    return this.socket
  }

  private attachSocket(socket: Socket) {
    if (this.listenersAttached) return
    this.listenersAttached = true

    for (const event of REALTIME_EVENTS) {
      socket.on(event, (payload: unknown) => {
        this.recordEvent(event, payload)
        this.dispatch(event, payload)
      })
    }

    socket.on('feed:update', (payload: unknown) => {
      if (!this.awaitingReconnectSnapshot) {
        warnLegacyEvent('feed:update')
        return
      }
      this.awaitingReconnectSnapshot = false
      const tokens = parseFeedSnapshot(payload)
      registryDebug.event('reconnect:snapshot', { count: tokens.length })
      this.reconnectSnapshotHandlers.forEach((h) => h(tokens))
    })

    socket.on('feed:patch', () => warnLegacyEvent('feed:patch'))
    socket.on('feed:prepend', () => warnLegacyEvent('feed:prepend'))
    socket.on('token:update', () => warnLegacyEvent('token:update'))
    socket.on('autotrader:signal', () => warnLegacyEvent('autotrader:signal'))

    socket.io.on('reconnect_attempt', () => {
      useRealtimeStore.getState().recordReconnect()
      useRealtimeStore.getState().setReconnecting(true)
    })

    socket.on('connect', () => this.onSocketConnected())
    socket.on('disconnect', () => this.onSocketDisconnected())
    socket.on('connect_error', (err) => {
      console.warn('[realtime] connect_error', err.message, 'url=', this.wsUrl())
    })
  }

  private onSocketConnected() {
    useRealtimeStore.getState().setConnected(true)
    useRealtimeStore.getState().setReconnecting(false)
    registryDebug.event('connect')
    this.awaitingReconnectSnapshot = true
    this.emitFeedSubscribe()
    this.resubscribeAll()
    this.flushPatchBuffer()
    this.connectHandlers.forEach((h) => h())
  }

  private onSocketDisconnected() {
    useRealtimeStore.getState().setConnected(false)
    useRealtimeStore.getState().setReconnecting(true)
    registryDebug.event('disconnect')
    this.disconnectHandlers.forEach((h) => h())
  }

  private recordEvent(event: RealtimeEventName, payload: unknown) {
    const d = useRealtimeStore.getState().diagnostics
    const now = Date.now()
    let latencyMs = 0
    if (payload && typeof payload === 'object') {
      const emittedAt = Number((payload as { emittedAt?: number }).emittedAt)
      const at = (payload as { at?: string }).at
      if (emittedAt > 0) latencyMs = Math.max(0, now - emittedAt)
      else if (at) latencyMs = Math.max(0, now - Date.parse(at))
    }
    this.latencySum += latencyMs
    this.latencySamples++
    useRealtimeStore.getState().patchDiagnostics({
      eventsReceived: d.eventsReceived + 1,
      lastEventAt: now,
      avgEventLatencyMs:
        this.latencySamples > 0 ? Math.round(this.latencySum / this.latencySamples) : 0,
      ...(event === 'registry:patch'
        ? { patchesReceived: d.patchesReceived + 1, lastPatchAt: now }
        : {}),
    })
  }

  private emitFeedSubscribe() {
    if (!this.socket?.connected) return
    registryDebug.event('subscribe:feed')
    this.socket.emit('subscribe:feed')
  }

  private resubscribeAll() {
    if (!this.socket?.connected) return
    for (const mint of this.tokenRefCounts.keys()) {
      if ((this.tokenRefCounts.get(mint) ?? 0) > 0) {
        this.socket.emit('subscribe:token', { mint })
      }
    }
  }

  private bufferPatch(token: PumpToken): boolean {
    const rt = useRealtimeStore.getState()
    if (!rt.reconnecting && this.socket?.connected) return false
    if (this.patchBuffer.length >= MAX_PATCH_BUFFER) {
      this.patchBuffer.shift()
      rt.patchDiagnostics({ patchesDropped: rt.diagnostics.patchesDropped + 1 })
    }
    this.patchBuffer.push(token)
    rt.patchDiagnostics({ patchesBuffered: rt.diagnostics.patchesBuffered + 1 })
    return true
  }

  private flushPatchBuffer() {
    if (this.patchBuffer.length === 0) return
    const batch = this.patchBuffer.splice(0, this.patchBuffer.length)
    for (const token of batch) {
      this.patchHandlers.forEach((h) => h(token))
    }
  }

  private dispatch(event: RealtimeEventName, payload: unknown) {
    switch (event) {
      case 'registry:patch': {
        const token = payload as PumpToken
        if (!token?.mint) return
        if (this.bufferPatch(token)) return
        this.patchHandlers.forEach((h) => h(token))
        break
      }
      case 'trade:tick':
        this.tradeHandlers.forEach((h) => h(payload as TradeTickPayload))
        break
      case 'chart:update':
        this.chartHandlers.forEach((h) => h(payload))
        break
      case 'token:state-change':
        this.stateHandlers.forEach((h) => h(payload as TokenStateChangePayload))
        break
      case 'signal:update':
        this.signalHandlers.forEach((h) => h(payload as SignalUpdatePayload))
        break
      case 'migration:update':
        this.migrationHandlers.forEach((h) => h(payload as MigrationUpdatePayload))
        break
      case 'holder:update':
        this.holderHandlers.forEach((h) => h(payload as HolderUpdatePayload))
        break
      case 'wallet:update':
        this.walletHandlers.forEach((h) => h(payload as WalletUpdatePayload))
        break
      case 'bubblemap:update':
        this.bubblemapHandlers.forEach((h) => h(payload as BubbleMapUpdatePayload))
        break
    }
  }

  get connected() {
    return Boolean(this.socket?.connected)
  }

  get isReconnecting() {
    const rt = useRealtimeStore.getState()
    return rt.reconnecting || Boolean(this.socket && !this.socket.connected)
  }

  getDiagnostics() {
    return useRealtimeStore.getState().diagnostics
  }

  /** Ref-counted token room subscription — returns unsubscribe. */
  subscribeToken(mint: string): () => void {
    if (!mint) return () => undefined
    this.start()
    const prev = this.tokenRefCounts.get(mint) ?? 0
    const next = prev + 1
    this.tokenRefCounts.set(mint, next)
    if (next === 1 && this.socket?.connected) {
      this.socket.emit('subscribe:token', { mint })
    }
    if (this.tokenRefCounts.size > MAX_TOKEN_SUBS && import.meta.env.DEV) {
      console.warn(`[realtime] ${this.tokenRefCounts.size} token subs — consider narrowing scope`)
    }
    return () => {
      const n = (this.tokenRefCounts.get(mint) ?? 1) - 1
      if (n <= 0) this.tokenRefCounts.delete(mint)
      else this.tokenRefCounts.set(mint, n)
    }
  }

  onConnect(handler: Handler<void>) {
    this.connectHandlers.add(handler)
    if (this.socket?.connected) handler()
    return () => this.connectHandlers.delete(handler)
  }

  onDisconnect(handler: Handler<void>) {
    this.disconnectHandlers.add(handler)
    return () => this.disconnectHandlers.delete(handler)
  }

  onRegistryPatch(handler: Handler<PumpToken>) {
    this.patchHandlers.add(handler)
    return () => this.patchHandlers.delete(handler)
  }

  /** One-shot feed snapshot after subscribe:feed on connect/reconnect. */
  onReconnectSnapshot(handler: Handler<PumpToken[]>) {
    this.reconnectSnapshotHandlers.add(handler)
    return () => this.reconnectSnapshotHandlers.delete(handler)
  }

  onTradeTick(handler: Handler<TradeTickPayload>) {
    this.tradeHandlers.add(handler)
    return () => this.tradeHandlers.delete(handler)
  }

  onChartUpdate(handler: Handler<unknown>) {
    this.chartHandlers.add(handler)
    return () => this.chartHandlers.delete(handler)
  }

  onTokenStateChange(handler: Handler<TokenStateChangePayload>) {
    this.stateHandlers.add(handler)
    return () => this.stateHandlers.delete(handler)
  }

  onSignalUpdate(handler: Handler<SignalUpdatePayload>) {
    this.signalHandlers.add(handler)
    return () => this.signalHandlers.delete(handler)
  }

  onMigrationUpdate(handler: Handler<MigrationUpdatePayload>) {
    this.migrationHandlers.add(handler)
    return () => this.migrationHandlers.delete(handler)
  }

  onHolderUpdate(handler: Handler<HolderUpdatePayload>) {
    this.holderHandlers.add(handler)
    return () => this.holderHandlers.delete(handler)
  }

  onWalletUpdate(handler: Handler<WalletUpdatePayload>) {
    this.walletHandlers.add(handler)
    return () => this.walletHandlers.delete(handler)
  }

  onBubblemapUpdate(handler: Handler<BubbleMapUpdatePayload>) {
    this.bubblemapHandlers.add(handler)
    return () => this.bubblemapHandlers.delete(handler)
  }
}

export const realtimeGateway = new RealtimeGateway()

/** @deprecated Use realtimeGateway — kept for gradual import migration */
export const wsService = {
  connect: () => realtimeGateway.start(),
  get connected() {
    return realtimeGateway.connected
  },
  get isReconnecting() {
    return realtimeGateway.isReconnecting
  },
  subscribeToken: (mint: string) => realtimeGateway.subscribeToken(mint),
  onConnect: (h: () => void) => realtimeGateway.onConnect(h),
  onDisconnect: (h: () => void) => realtimeGateway.onDisconnect(h),
  onRegistryPatch: (h: (t: PumpToken) => void) => realtimeGateway.onRegistryPatch(h),
  onFeedSnapshot: (h: (tokens: PumpToken[]) => void) => realtimeGateway.onReconnectSnapshot(h),
  onTradeTick: (h: (t: TradeTickPayload) => void) => realtimeGateway.onTradeTick(h),
  onChartUpdate: (h: (p: unknown) => void) => realtimeGateway.onChartUpdate(h),
  onTokenStateChange: (h: (p: TokenStateChangePayload) => void) =>
    realtimeGateway.onTokenStateChange(h),
  onSignalUpdate: (h: (p: SignalUpdatePayload) => void) => realtimeGateway.onSignalUpdate(h),
  onMigrationUpdate: (h: (p: MigrationUpdatePayload) => void) => realtimeGateway.onMigrationUpdate(h),
  onHolderUpdate: (h: (p: HolderUpdatePayload) => void) => realtimeGateway.onHolderUpdate(h),
  onWalletUpdate: (h: (p: WalletUpdatePayload) => void) => realtimeGateway.onWalletUpdate(h),
  onAutoTradeSignal: (_h: (s: unknown) => void) => {
    if (import.meta.env.DEV) {
      console.warn('[realtime] onAutoTradeSignal removed — use signal:update + registry:patch')
    }
    return () => undefined
  },
}
