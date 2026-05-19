import type { PumpPortalPool } from '@/types'

const API = import.meta.env.VITE_API_URL || '/api'

export interface BuildTradeParams {
  publicKey: string
  action: 'buy' | 'sell'
  mint: string
  amountSol: number
  slippage: number
  priorityFee: number
  pool?: PumpPortalPool
  sellPercent?: string
}

/** Proxy to PumpPortal trade-local — returns base64 serialized versioned transaction */
export async function buildPumpPortalTransaction(params: BuildTradeParams): Promise<string> {
  const res = await fetch(`${API}/pumpportal/trade-local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: params.publicKey,
      action: params.action,
      mint: params.mint,
      amount: params.action === 'sell' && params.sellPercent ? params.sellPercent : params.amountSol,
      denominatedInSol: params.action === 'buy' || !params.sellPercent ? 'true' : 'false',
      slippage: params.slippage,
      priorityFee: params.priorityFee,
      pool: params.pool ?? 'auto',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `Trade build failed (${res.status})`)
  }

  const buf = await res.arrayBuffer()
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

export async function buildTradeViaBackend(params: BuildTradeParams): Promise<string> {
  const res = await fetch(`${API}/trade/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(await res.text())
  const { transaction } = await res.json()
  return transaction as string
}
