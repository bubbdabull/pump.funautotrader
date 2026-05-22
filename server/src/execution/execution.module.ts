import { Module } from '@nestjs/common'
import { ExecutionEngineService } from './execution-engine.service'
import { ExecutionController } from './execution.controller'
import { PumpPortalModule } from '../pumpportal/pumpportal.module'

@Module({
  imports: [PumpPortalModule],
  controllers: [ExecutionController],
  providers: [ExecutionEngineService],
  exports: [ExecutionEngineService],
})
export class ExecutionModule {}
