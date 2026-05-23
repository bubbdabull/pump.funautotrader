import { Module } from '@nestjs/common'
import { HeliusService } from './helius.service'
import { RpcModule } from '../rpc/rpc.module'

/** Holder/RPC enrichment only — webhook controller is in IngestionModule. */
@Module({
  imports: [RpcModule],
  providers: [HeliusService],
  exports: [HeliusService],
})
export class HeliusModule {}
