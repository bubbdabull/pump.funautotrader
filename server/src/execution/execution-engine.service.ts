import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { globalRiskManager } from '@phronis/trading'
import { PumpPortalService } from '../pumpportal/pumpportal.service'
import type { PumpPortalTradeRequest } from '../pumpportal/pumpportal.types'

export interface ExecutionRequest {
  publicKey: string
  action: 'buy' | 'sell'
  mint: string
  amountSol: number
  slippage?: number
  priorityFee?: number
  pool?: PumpPortalTradeRequest['pool']
  strategyId?: string
  evConfidence?: number
}

export interface ExecutionResult {
  ok: boolean
  tx?: Buffer
  slippageUsed: number
  priorityFee: number
  positionSizeSol: number
  latencyMs: number
  error?: string
  retries: number
}

@Injectable()
export class ExecutionEngineService {
  private readonly logger = new Logger(ExecutionEngineService.name)
  private readonly maxRetries: number
  private readonly useJito: boolean

  constructor(
    private config: ConfigService,
    private pumpportal: PumpPortalService,
  ) {
    this.maxRetries = Number(this.config.get('EXEC_MAX_RETRIES') ?? 3)
    this.useJito = this.config.get('JITO_BUNDLES_ENABLED') === 'true'
  }

  /** Dynamic slippage from volatility proxy (confidence inverse). */
  dynamicSlippage(base: number, evConfidence: number): number {
    const volBump = (1 - evConfidence) * 8
    return Math.min(25, Math.max(5, base + volBump))
  }

  priorityFeeLamports(sol: number): number {
    const min = Number(this.config.get('EXEC_MIN_PRIORITY_FEE') ?? 0.00005)
    const max = Number(this.config.get('EXEC_MAX_PRIORITY_FEE') ?? 0.001)
    return Math.min(max, Math.max(min, sol))
  }

  async execute(req: ExecutionRequest): Promise<ExecutionResult> {
    const started = Date.now()
    const riskCheck = globalRiskManager.canOpenTrade()
    if (req.action === 'buy' && !riskCheck.allowed) {
      return {
        ok: false,
        slippageUsed: 0,
        priorityFee: 0,
        positionSizeSol: 0,
        latencyMs: Date.now() - started,
        error: riskCheck.reason,
        retries: 0,
      }
    }

    const slippage = this.dynamicSlippage(req.slippage ?? 10, req.evConfidence ?? 0.5)
    const stopDist = slippage * 0.8
    const positionSizeSol = globalRiskManager.positionSizeSol(stopDist, req.evConfidence ?? 0.5)
    const amount = req.action === 'buy' ? positionSizeSol : req.amountSol
    const priorityFee = this.priorityFeeLamports(req.priorityFee ?? 0.0001)

    let retries = 0
    let lastError: string | undefined

    while (retries <= this.maxRetries) {
      try {
        const body: PumpPortalTradeRequest = {
          publicKey: req.publicKey,
          action: req.action,
          mint: req.mint,
          amount,
          denominatedInSol: 'true',
          slippage,
          priorityFee,
          pool: req.pool ?? 'auto',
        }

        if (this.useJito) {
          this.logger.debug(`Jito bundle path reserved for ${req.mint.slice(0, 8)}…`)
        }

        const tx = await this.pumpportal.buildTradeTransaction(body)
        if (req.action === 'buy') globalRiskManager.registerOpen()

        return {
          ok: true,
          tx,
          slippageUsed: slippage,
          priorityFee,
          positionSizeSol: amount,
          latencyMs: Date.now() - started,
          retries,
        }
      } catch (err) {
        lastError = (err as Error).message
        retries++
        await new Promise((r) => setTimeout(r, 50 * retries))
      }
    }

    return {
      ok: false,
      slippageUsed: slippage,
      priorityFee,
      positionSizeSol: amount,
      latencyMs: Date.now() - started,
      error: lastError,
      retries,
    }
  }

  registerClose(pnlSol: number) {
    globalRiskManager.registerClose(pnlSol)
  }
}
