import type { EventCursor } from './types'

export interface IncomingEventMeta {
  slot?: number
  timestampMs: number
  signature?: string
  sequenceId: number
}

export function createEventCursor(): EventCursor {
  return {
    lastSlot: 0,
    lastTimestamp: 0,
    sequenceId: 0,
  }
}

/** Reject stale / duplicate / out-of-order events. */
export function shouldAcceptEvent(
  cursor: EventCursor,
  incoming: IncomingEventMeta,
): { accept: boolean; reason?: string } {
  if (incoming.signature && incoming.signature === cursor.lastSignature) {
    return { accept: false, reason: 'duplicate_signature' }
  }

  if (incoming.sequenceId > 0 && incoming.sequenceId <= cursor.sequenceId) {
    return { accept: false, reason: 'stale_sequence' }
  }

  if (incoming.slot != null && incoming.slot > 0 && cursor.lastSlot > 0) {
    if (incoming.slot < cursor.lastSlot) {
      return { accept: false, reason: 'stale_slot' }
    }
  }

  if (incoming.timestampMs > 0 && cursor.lastTimestamp > 0) {
    if (incoming.timestampMs + 2_000 < cursor.lastTimestamp) {
      return { accept: false, reason: 'stale_timestamp' }
    }
  }

  return { accept: true }
}

export function advanceCursor(cursor: EventCursor, incoming: IncomingEventMeta): void {
  if (incoming.sequenceId > cursor.sequenceId) cursor.sequenceId = incoming.sequenceId
  if (incoming.slot != null && incoming.slot > cursor.lastSlot) cursor.lastSlot = incoming.slot
  if (incoming.timestampMs > cursor.lastTimestamp) cursor.lastTimestamp = incoming.timestampMs
  if (incoming.signature) cursor.lastSignature = incoming.signature
}
