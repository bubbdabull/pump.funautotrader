import { Global, Module, forwardRef } from '@nestjs/common'
import { EventsModule } from '../events/events.module'
import { MarketDynamicsService } from './market-dynamics.service'
import { WalletBehaviorAnalyzerService } from './wallet-behavior-analyzer.service'
import { EventSequencerService } from './event-sequencer.service'
import { SignalAttributionService } from './signal-attribution.service'
import { AnalyticsBatcherService } from './analytics-batcher.service'
import { StreamIntelligenceService } from './stream-intelligence.service'
import { TokenLifecycleService } from './token-lifecycle.service'
import { TerminalEmitterService } from './terminal-emitter.service'
import { WalletGraphService } from './wallet-graph.service'
import { SignalIntelligenceService } from './signal-intelligence.service'
import { RpcModule } from '../rpc/rpc.module'
import { HoldersModule } from '../holders/holders.module'
import { TradingModule } from '../trading/trading.module'

@Global()
@Module({
  imports: [
    RpcModule,
    TradingModule,
    forwardRef(() => EventsModule),
    forwardRef(() => HoldersModule),
  ],
  providers: [
    SignalIntelligenceService,
    MarketDynamicsService,
    WalletBehaviorAnalyzerService,
    EventSequencerService,
    SignalAttributionService,
    AnalyticsBatcherService,
    StreamIntelligenceService,
    TokenLifecycleService,
    TerminalEmitterService,
    WalletGraphService,
  ],
  exports: [
    MarketDynamicsService,
    WalletBehaviorAnalyzerService,
    EventSequencerService,
    SignalAttributionService,
    AnalyticsBatcherService,
    StreamIntelligenceService,
    TokenLifecycleService,
    TerminalEmitterService,
    WalletGraphService,
    SignalIntelligenceService,
  ],
})
export class IntelligenceModule {}
