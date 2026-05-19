import { useEffect, useRef } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { pumpPortalWs } from '@/services/pumpportal-ws'
import { wsService } from '@/services/websocket'
import { useAutoTraderStore } from '@/stores/autoTraderStore'
import { usePumpPortalTrade } from './usePumpPortalTrade'
import type { PumpToken, AutoTradeSignal } from '@/types'
import { evaluateProbabilisticEntry, pumpTokenFromMint } from '@/lib/probabilisticTrading'
import { useDirectPumpPortalWs } from '@/lib/pumpportalConfig'
import { globalMarketState, evScoreToSignalScore } from '@trading'

export function useAutoTrader() {
  const { publicKey } = useWallet()
  const { execute, loading } = usePumpPortalTrade()
  const rules = useAutoTraderStore((s) => s.rules)
  const positions = useAutoTraderStore((s) => s.positions)
  const addSignal = useAutoTraderStore((s) => s.addSignal)
  const addExecution = useAutoTraderStore((s) => s.addExecution)
  const setPosition = useAutoTraderStore((s) => s.setPosition)
  const removePosition = useAutoTraderStore((s) => s.removePosition)
  const processing = useRef(new Set<string>())

  const tryTrade = async (token: PumpToken, reason: string, amountSol?: number) => {
    if (!publicKey || !rules.enabled) return
    if (processing.current.has(token.mint)) return

    const decision = evaluateProbabilisticEntry(token.mint, rules)
    if (!decision?.allowed) return

    const sizeSol = amountSol ?? decision.positionSizeSol ?? rules.buyAmountSol
    processing.current.add(token.mint)

    const signal: AutoTradeSignal = {
      mint: token.mint,
      symbol: token.symbol,
      name: token.name,
      reason,
      bondingCurvePercent: token.bondingCurvePercent,
      marketCap: token.marketCap,
      signalScore: evScoreToSignalScore(decision.metrics),
      timestamp: new Date().toISOString(),
    }
    addSignal(signal)

    const execId = crypto.randomUUID()
    addExecution({
      id: execId,
      mint: token.mint,
      side: 'buy',
      amountSol: sizeSol,
      status: 'pending',
      timestamp: new Date().toISOString(),
    })

    try {
      const sig = await execute({
        mint: token.mint,
        action: 'buy',
        amountSol: sizeSol,
        slippage: rules.slippage,
        priorityFee: rules.priorityFee,
        pool: rules.pool,
      })

      addExecution({
        id: execId,
        mint: token.mint,
        side: 'buy',
        amountSol: sizeSol,
        status: 'confirmed',
        signature: sig,
        timestamp: new Date().toISOString(),
      })
      globalMarketState.registerPosition(
        token.mint,
        sizeSol,
        decision.metrics.evScore,
      )
      setPosition(token.mint, {
        entrySol: sizeSol,
        symbol: token.symbol,
        entryEvScore: decision.metrics.evScore,
      })
    } catch (e) {
      addExecution({
        id: execId,
        mint: token.mint,
        side: 'buy',
        amountSol: sizeSol,
        status: 'failed',
        error: e instanceof Error ? e.message : 'Failed',
        timestamp: new Date().toISOString(),
      })
    } finally {
      setTimeout(() => processing.current.delete(token.mint), 30_000)
    }
  }

  const trySell = async (mint: string, _exitReason: string) => {
    if (!publicKey || !rules.enabled) return
    const pos = positions[mint]
    if (!pos || processing.current.has(`sell-${mint}`)) return

    processing.current.add(`sell-${mint}`)
    const execId = crypto.randomUUID()
    addExecution({
      id: execId,
      mint,
      side: 'sell',
      amountSol: pos.entrySol,
      status: 'pending',
      timestamp: new Date().toISOString(),
    })

    try {
      const sig = await execute({
        mint,
        action: 'sell',
        amountSol: pos.entrySol,
        slippage: rules.slippage,
        priorityFee: rules.priorityFee,
        pool: rules.pool,
      })
      addExecution({
        id: execId,
        mint,
        side: 'sell',
        amountSol: pos.entrySol,
        status: 'confirmed',
        signature: sig,
        timestamp: new Date().toISOString(),
      })
      globalMarketState.clearPosition(mint)
      removePosition(mint)
    } catch (e) {
      addExecution({
        id: execId,
        mint,
        side: 'sell',
        amountSol: pos.entrySol,
        status: 'failed',
        error: e instanceof Error ? e.message : 'Failed',
        timestamp: new Date().toISOString(),
      })
    } finally {
      setTimeout(() => processing.current.delete(`sell-${mint}`), 15_000)
    }
  }

  const onToken = (token: PumpToken) => {
    if (!rules.snipeNewTokens) return
    const decision = evaluateProbabilisticEntry(token.mint, rules)
    if (!decision) return
    const { evScore, components } = decision.metrics
    tryTrade(
      token,
      `EV=${evScore.toFixed(2)} MQI=${components.mqi.toFixed(2)} LSI=${components.lsi.toFixed(2)}`,
      decision.positionSizeSol,
    )
  }

  const directPumpPortal = useDirectPumpPortalWs()

  useEffect(() => {
    if (!rules.enabled) return

    const unsubDirect = directPumpPortal ? pumpPortalWs.onNewToken(onToken) : () => {}
    const unsubServer = wsService.onPumpPortalToken(onToken)
    const unsubSignal = wsService.onAutoTradeSignal((s) => {
      if (!rules.enabled) return
      const token = pumpTokenFromMint(s.mint)
      tryTrade(token, s.reason)
    })

    const unsubExit = globalMarketState.onExit((mint, exit) => {
      if (!positions[mint] || !exit.shouldExit) return
      trySell(mint, exit.reasons.join(', '))
    })

    wsService.connect()

    return () => {
      unsubDirect()
      unsubServer()
      unsubSignal()
      unsubExit()
    }
  }, [rules.enabled, rules.snipeNewTokens, publicKey, positions, directPumpPortal])

  return { loading, rules }
}
