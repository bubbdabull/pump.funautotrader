import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PumpPortalService } from '../pumpportal/pumpportal.service'
import { SupabaseDbService } from '../supabase/supabase-db.service'
import type { PumpPortalPool, PumpPortalTradeRequest } from '../pumpportal/pumpportal.types'

@Injectable()
export class TradeService {
  private readonly logger = new Logger(TradeService.name)

  constructor(
    private prisma: PrismaService,
    private pumpportal: PumpPortalService,
    private supabase: SupabaseDbService,
  ) {}

  async buildTransaction(body: {
    publicKey: string
    action: 'buy' | 'sell'
    mint: string
    amountSol: number
    slippage: number
    priorityFee: number
    pool?: PumpPortalPool
    sellPercent?: string
  }) {
    const req: PumpPortalTradeRequest = {
      publicKey: body.publicKey,
      action: body.action,
      mint: body.mint,
      amount: body.action === 'sell' && body.sellPercent ? body.sellPercent : body.amountSol,
      denominatedInSol: body.action === 'buy' || !body.sellPercent ? 'true' : 'false',
      slippage: body.slippage,
      priorityFee: body.priorityFee,
      pool: body.pool ?? 'auto',
    }

    const txBytes = await this.pumpportal.buildTradeTransaction(req)
    return { transaction: txBytes.toString('base64') }
  }

  async recordTrade(order: {
    mint: string
    side: 'buy' | 'sell'
    amountSol: number
    wallet: string
    txSig?: string
  }) {
    if (!this.prisma.enabled) {
      if (this.supabase.enabled) return this.supabase.createTrade(order)
      return { ...order, id: 'offline', status: 'pending' as const }
    }
    return this.prisma.trade.create({
      data: {
        mint: order.mint,
        wallet: order.wallet,
        side: order.side,
        amountSol: order.amountSol,
        txSig: order.txSig,
        status: order.txSig ? 'confirmed' : 'pending',
      },
    })
  }
}
