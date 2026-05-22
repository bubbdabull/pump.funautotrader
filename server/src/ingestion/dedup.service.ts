import { Injectable } from '@nestjs/common'

/** Memory-safe deduplication with TTL window. */
@Injectable()
export class DedupService {
  private readonly seen = new Map<string, number>()
  private readonly maxSize = 50_000
  private readonly ttlMs = 120_000

  isDuplicate(key: string): boolean {
    const now = Date.now()
    this.evict(now)
    const exp = this.seen.get(key)
    if (exp != null && exp > now) return true
    this.seen.set(key, now + this.ttlMs)
    if (this.seen.size > this.maxSize) this.trim(now)
    return false
  }

  private evict(now: number) {
    if (this.seen.size < this.maxSize * 0.9) return
    for (const [k, exp] of this.seen) {
      if (exp <= now) this.seen.delete(k)
    }
  }

  private trim(now: number) {
    const entries = [...this.seen.entries()].sort((a, b) => a[1] - b[1])
    const drop = Math.floor(entries.length * 0.25)
    for (let i = 0; i < drop; i++) this.seen.delete(entries[i][0])
    this.evict(now)
  }
}
