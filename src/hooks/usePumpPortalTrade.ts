import { useCallback, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { VersionedTransaction } from '@solana/web3.js'
import { buildPumpPortalTransaction } from '@/services/pumpportal'
import type { PumpPortalPool } from '@/types'

export function usePumpPortalTrade() {
  const { connection } = useConnection()
  const { publicKey, signTransaction } = useWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const execute = useCallback(
    async (params: {
      mint: string
      action: 'buy' | 'sell'
      amountSol: number
      slippage: number
      priorityFee: number
      pool?: PumpPortalPool
      sellPercent?: string
      /** Pre-built tx from /api/execution/build (server-sized). */
      serializedTxBase64?: string
    }) => {
      if (!publicKey || !signTransaction) {
        throw new Error('Connect wallet first')
      }

      setLoading(true)
      setError(null)

      try {
        const b64 =
          params.serializedTxBase64 ??
          (await buildPumpPortalTransaction({
            publicKey: publicKey.toBase58(),
            ...params,
          }))

        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        const tx = VersionedTransaction.deserialize(bytes)
        const signed = await signTransaction(tx)
        const sig = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        })

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')

        return sig
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Trade failed'
        setError(msg)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [publicKey, signTransaction, connection],
  )

  return { execute, loading, error }
}
