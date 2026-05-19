import { Module } from '@nestjs/common'
import { PumpService } from './pump.service'

@Module({
  providers: [PumpService],
  exports: [PumpService],
})
export class PumpModule {}
