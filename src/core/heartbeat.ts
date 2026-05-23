import type { ConnectionStatus } from '@/domain/tokens/tokenTypes'

export const HEARTBEAT_OFFLINE_MS = 10_000
export const HEARTBEAT_DEGRADED_MS = 5_000

let lastHeartbeatAt = 0
let lastRegistryAt = 0
let lastTradeAt = 0

export function touchHeartbeat() {
  lastHeartbeatAt = Date.now()
}

export function touchRegistryActivity() {
  const now = Date.now()
  lastRegistryAt = now
  lastHeartbeatAt = now
}

export function touchTradeActivity() {
  const now = Date.now()
  lastTradeAt = now
  lastHeartbeatAt = now
}

export function getHeartbeatTimestamps() {
  return {
    heartbeat: lastHeartbeatAt,
    registry: lastRegistryAt,
    trade: lastTradeAt,
  }
}

export function resolveConnectionStatus(wsConnected: boolean): ConnectionStatus {
  if (!wsConnected) return 'OFFLINE'
  const now = Date.now()
  const last = Math.max(lastHeartbeatAt, lastRegistryAt, lastTradeAt)
  if (last <= 0) return wsConnected ? 'DEGRADED' : 'OFFLINE'
  const age = now - last
  if (age > HEARTBEAT_OFFLINE_MS) return 'OFFLINE'
  if (age > HEARTBEAT_DEGRADED_MS) return 'DEGRADED'
  return 'CONNECTED'
}
