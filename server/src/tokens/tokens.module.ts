import { Module, forwardRef } from '@nestjs/common'
import { TokensController } from './tokens.controller'
import { TokensService } from './tokens.service'
import { TokenMetadataService } from './token-metadata.service'
import { PumpModule } from '../pump/pump.module'
import { PumpPortalModule } from '../pumpportal/pumpportal.module'
import { TradingModule } from '../trading/trading.module'

@Module({
  imports: [PumpModule, TradingModule, forwardRef(() => PumpPortalModule)],
  controllers: [TokensController],
  providers: [TokensService, TokenMetadataService],
  exports: [TokensService, TokenMetadataService],
})
export class TokensModule {}
