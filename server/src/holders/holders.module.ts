import { Module, forwardRef } from '@nestjs/common'
import { HeliusModule } from '../helius/helius.module'
import { BubblemapsService } from './bubblemaps.service'
import { HolderEnrichmentService } from './holder-enrichment.service'
import { TokensModule } from '../tokens/tokens.module'
import { FeedModule } from '../feed/feed.module'
import { EventsModule } from '../events/events.module'
import { PumpModule } from '../pump/pump.module'
import { IntelligenceModule } from '../intelligence/intelligence.module'

@Module({
  imports: [
    HeliusModule,
    FeedModule,
    forwardRef(() => IntelligenceModule),
    forwardRef(() => EventsModule),
    PumpModule,
    forwardRef(() => TokensModule),
  ],
  providers: [BubblemapsService, HolderEnrichmentService],
  exports: [HolderEnrichmentService, BubblemapsService],
})
export class HoldersModule {}
