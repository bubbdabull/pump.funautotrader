import { Module } from '@nestjs/common'
import { HeliusController } from './helius.controller'
import { HeliusService } from './helius.service'

@Module({
  controllers: [HeliusController],
  providers: [HeliusService],
  exports: [HeliusService],
})
export class HeliusModule {}
