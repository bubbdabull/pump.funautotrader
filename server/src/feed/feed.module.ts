import { Global, Module } from '@nestjs/common'
import { LiveFeedService } from './live-feed.service'

@Global()
@Module({
  providers: [LiveFeedService],
  exports: [LiveFeedService],
})
export class FeedModule {}
