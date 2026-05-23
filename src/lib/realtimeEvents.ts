/** Canonical Socket.IO events from Phronis API — do not add legacy aliases here. */
export const REALTIME_EVENTS = [
  'registry:patch',
  'trade:tick',
  'chart:update',
  'token:state-change',
  'signal:update',
  'migration:update',
  'holder:update',
  'wallet:update',
  'bubblemap:update',
] as const

export type RealtimeEventName = (typeof REALTIME_EVENTS)[number]

export type StreamMetaPayload = {
  epoch: number
  leaderId?: string | null
  instanceId?: string
  isLeader?: boolean
}
