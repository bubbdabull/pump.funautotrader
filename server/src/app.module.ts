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

/** Bull/Redis is optional — live feed uses PumpPortal WS, not the job queue. */
function redisEnabled(): boolean {
  if (process.env.REDIS_DISABLED === 'true') return false
  const url = process.env.REDIS_URL?.trim()
  return Boolean(url)
}

const bullImports: (Type | DynamicModule)[] = redisEnabled()
  ? [
      BullModule.forRoot({
        connection: { url: process.env.REDIS_URL! },
      }),
      BullModule.registerQueue({ name: 'feed' }, { name: 'trades' }),
    ]
  : []

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ...bullImports,
    PrismaModule,
    SupabaseModule,
    PumpModule,
    FeedModule,
    TradingModule,
    PumpPortalModule,
    AutoTraderModule,
    HeliusModule,
    TokensModule,
    WalletsModule,
    TradeModule,
    AlertsModule,
    EventsModule,
  ],
  providers: redisEnabled() ? [FeedProcessor] : [],
})
export class AppModule {}
