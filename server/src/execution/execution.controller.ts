import { Body, Controller, Post } from '@nestjs/common'
import { ExecutionEngineService, type ExecutionRequest } from './execution-engine.service'

@Controller('execution')
export class ExecutionController {
  constructor(private execution: ExecutionEngineService) {}

  @Post('build')
  async build(@Body() body: ExecutionRequest) {
    const result = await this.execution.execute(body)
    if (!result.ok || !result.tx) {
      return {
        ok: false,
        error: result.error,
        slippageUsed: result.slippageUsed,
        positionSizeSol: result.positionSizeSol,
        latencyMs: result.latencyMs,
      }
    }
    return {
      ok: true,
      transaction: Buffer.from(result.tx).toString('base64'),
      slippageUsed: result.slippageUsed,
      priorityFee: result.priorityFee,
      positionSizeSol: result.positionSizeSol,
      latencyMs: result.latencyMs,
      retries: result.retries,
    }
  }
}
