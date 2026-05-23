import { Injectable } from '@nestjs/common'
import { LiveFeedService } from '../feed/live-feed.service'
import type { FeedToken } from '../feed/feed.types'
import type { NormalizedToken } from '../pipeline/normalized-token.types'

/**
 * Read-only API surface + controlled writes from ProcessingWorker only.
 * HTTP/WS subscribers read here — never recompute on request path.
 */
@Injectable()
export class SnapshotService {
  constructor(private liveFeed: LiveFeedService) {}

  size(): number {
    return this.liveFeed.size()
  }

  get(mint: string): FeedToken | undefined {
    return this.liveFeed.get(mint)
  }

  /** API bootstrap — bounded list, no full-map scan in controllers. */
  list(limit = 120): FeedToken[] {
    return this.liveFeed.getAll(limit)
  }

  /** Processing layer writes atomically (single mint patch). */
  patch(token: FeedToken): FeedToken | null {
    return this.liveFeed.patch(token)
  }

  upsertStream(token: FeedToken): FeedToken | null {
    return this.liveFeed.upsertStream(token)
  }

  upsert(token: FeedToken): FeedToken | null {
    return this.liveFeed.upsert(token)
  }
}

export type SnapshotPatch = NormalizedToken | FeedToken
