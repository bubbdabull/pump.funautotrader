import { Global, Module } from '@nestjs/common'
import { SolanaRpcService } from './solana-rpc.service'

@Global()
@Module({
  providers: [SolanaRpcService],
  exports: [SolanaRpcService],
})
export class RpcModule {}
