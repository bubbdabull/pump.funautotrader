import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { BullModule } from '@nestjs/bullmq'
import type { DynamicModule, Type } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { SupabaseModule } from './supabase/supabase.module'
import { TokensModule } from './tokens/tokens.module'
import { WalletsModule } from './wallets/wallets.module'
import { TradeModule } from './trade/trade.module'
import { AlertsModule } from './alerts/alerts.module'
import { EventsModule } from './events/events.module'
import { PumpModule } from './pump/pump.module'
import { HeliusModule } from './helius/helius.module'
import { PumpPortalModule } from './pumpportal/pumpportal.module'
import { AutoTraderModule } from './autotrader/autotrader.module'
import { TradingModule } from './trading/trading.module'
import { FeedModule } from './feed/feed.module'
import { FeedProcessor } from './jobs/feed.processor'
import { HealthController } from './health.controller'
import { DataHealthController } from './trade-data/data-health.controller'
import { TradeDataModule } from './trade-data/trade-data.module'
import { IngestionModule } from './ingestion/ingestion.module'
import { QuantModule } from './quant/quant.module'
import { ExecutionModule } from './execution/execution.module'
import { RiskModule } from './risk/risk.module'
import { BacktestModule } from './backtest/backtest.module'
import { HoldersModule } from './holders/holders.module'
import { PipelineModule } from './pipeline/pipeline.module'
import { IntelligenceModule } from './intelligence/intelligence.module'
import { RedisModule } from './redis/redis.module'
import { PersistenceModule } from './persistence/persistence.module'
import { RpcModule } from './rpc/rpc.module'
import { isApiProcess } from './process-role'

/** Bull/Redis is optional — live feed uses PumpPortal WS, not the job queue. */
function redisEnabled(): boolean {
  if (process.env.REDIS_DISABLED === 'true') return false
  const url = process.env.REDIS_URL?.trim()
  return Boolean(url)
}

/** Bull blocks Nest bootstrap on Redis connect — off by default on Fly API. */
function bullEnabled(): boolean {
  if (process.env.BULL_DISABLED === 'true') return false
  if (!isApiProcess()) return false
  return redisEnabled() && process.env.BULL_ENABLED === 'true'
}

const bullImports: (Type | DynamicModule)[] = bullEnabled()
  ? [
      BullModule.forRoot({
        connection: {
          url: process.env.REDIS_URL!,
          connectTimeout: 8_000,
          maxRetriesPerRequest: 2,
        },
      }),
      BullModule.registerQueue({ name: 'feed' }, { name: 'trades' }),
    ]
  : []

const apiImports: (Type | DynamicModule)[] = isApiProcess()
  ? [
      PumpModule,
      FeedModule,
      PipelineModule,
      IntelligenceModule,
      TradingModule,
      PumpPortalModule,
      AutoTraderModule,
      TokensModule,
      WalletsModule,
      TradeModule,
      AlertsModule,
      EventsModule,
      IngestionModule,
      QuantModule,
      ExecutionModule,
      RiskModule,
      BacktestModule,
      HoldersModule,
      TradeDataModule,
    ]
  : []

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ...bullImports,
    PrismaModule,
    SupabaseModule,
    RpcModule,
    RedisModule,
    PersistenceModule,
    HeliusModule,
    ...apiImports,
  ],
  controllers: isApiProcess() ? [HealthController, DataHealthController] : [],
  providers: bullEnabled() ? [FeedProcessor] : [],
})
export class AppModule {}
