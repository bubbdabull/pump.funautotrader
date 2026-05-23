import { Injectable } from '@nestjs/common'
import {
  advanceCursor,
  createEventCursor,
  shouldAcceptEvent,
  type EventCursor,
  type IncomingEventMeta,
} from '@phronis/trading'

@Injectable()
export class EventSequencerService {
  private readonly cursors = new Map<string, EventCursor>()
  private globalSequence = 0

  nextSequenceId(): number {
    return ++this.globalSequence
  }

  accept(
    mint: string,
    meta: IncomingEventMeta,
  ): { accept: boolean; reason?: string; sequenceId: number } {
    let cursor = this.cursors.get(mint)
    if (!cursor) {
      cursor = createEventCursor()
      this.cursors.set(mint, cursor)
    }
    const seq = meta.sequenceId > 0 ? meta.sequenceId : this.nextSequenceId()
    const verdict = shouldAcceptEvent(cursor, { ...meta, sequenceId: seq })
    if (!verdict.accept) return { accept: false, reason: verdict.reason, sequenceId: seq }
    advanceCursor(cursor, { ...meta, sequenceId: seq })
    if (this.cursors.size > 5000) this.prune()
    return { accept: true, sequenceId: seq }
  }

  getCursor(mint: string): EventCursor | undefined {
    return this.cursors.get(mint)
  }

  private prune() {
    const keys = [...this.cursors.keys()].slice(0, 500)
    for (const k of keys) this.cursors.delete(k)
  }
}
