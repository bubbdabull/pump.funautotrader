import { executionApi } from './api'
import { buildPumpPortalTransaction } from './pumpportal'

export async function buildSizedTransaction(params: {
  publicKey: string
  action: 'buy' | 'sell'
  mint: string
  amountSol: number
  slippage: number
  priorityFee: number
  pool?: string
  evConfidence?: number
  strategyId?: string
}): Promise<{ base64: string; positionSizeSol: number; slippageUsed: number }> {
  try {
    const res = await executionApi.build({
      publicKey: params.publicKey,
      action: params.action,
      mint: params.mint,
      amountSol: params.amountSol,
      slippage: params.slippage,
      priorityFee: params.priorityFee,
      pool: params.pool,
      evConfidence: params.evConfidence,
      strategyId: params.strategyId,
    })
    if (res.ok && res.transaction) {
      return {
        base64: res.transaction,
        positionSizeSol: res.positionSizeSol ?? params.amountSol,
        slippageUsed: res.slippageUsed ?? params.slippage,
      }
    }
  } catch {
    /* fallback */
  }

  const base64 = await buildPumpPortalTransaction({
    publicKey: params.publicKey,
    action: params.action,
    mint: params.mint,
    amountSol: params.amountSol,
    slippage: params.slippage,
    priorityFee: params.priorityFee,
    pool: params.pool as import('@/types').PumpPortalPool,
  })
  return { base64, positionSizeSol: params.amountSol, slippageUsed: params.slippage }
}
