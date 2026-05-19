import { Controller, Get } from '@nestjs/common'
import { WalletsService } from './wallets.service'

@Controller('wallets')
export class WalletsController {
  constructor(private wallets: WalletsService) {}

  @Get('smart')
  smart() {
    return this.wallets.getSmartWallets()
  }
}
