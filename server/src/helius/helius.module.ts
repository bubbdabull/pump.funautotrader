import { Module } from '@nestjs/common'
import { HeliusController } from './helius.controller'
import { HeliusService } from './helius.service'
import { IngestionModule } from '../ingestion/ingestion.module'
import { RpcModule } from '../rpc/rpc.module'

@Module({
  imports: [RpcModule, IngestionModule],
  controllers: [HeliusController],
  providers: [HeliusService],
  exports: [HeliusService],
})
export class HeliusModule {}
