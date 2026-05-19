import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { TokensService } from '../tokens/tokens.service'
import { EventsGateway } from '../events/events.gateway'

@Processor('feed')
export class FeedProcessor extends WorkerHost {
  private readonly logger = new Logger(FeedProcessor.name)

  constructor(
    private tokens: TokensService,
    private events: EventsGateway,
  ) {
    super()
  }

  async process(_job: Job) {
    const count = await this.tokens.syncFromPump()
    const feed = await this.tokens.getFeed()
    this.events.server?.to('feed').emit('feed:update', feed)
    this.logger.debug(`Synced ${count} tokens`)
    return { count }
  }
}
