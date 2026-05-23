import { useEffect, useRef } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { pumpPortalWs } from '@/services/pumpportal-ws'
import { wsService } from '@/services/websocket'
import { useAutoTraderStore } from '@/stores/autoTraderStore'
import { usePumpPortalTrade } from './usePumpPortalTrade'
import { buildSizedTransaction } from '@/services/execution'
import type { PumpToken, AutoTradeSignal } from '@/types'
import { evaluateProbabilisticEntry, pumpTokenFromMint } from '@/lib/probabilisticTrading'
import { hydrateMarketStateFromApi } from '@/lib/hydrateMarketState'
import { autoTraderApi } from '@/services/api'
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

  const passesLegacy = (token: PumpToken, signal?: AutoTradeSignal) => {
    const curve = signal?.bondingCurvePercent ?? token.bondingCurvePercent
    const mcap = signal?.marketCap ?? token.marketCap
    const score = signal?.signalScore ?? token.signalScore ?? token.aiRiskScore ?? 50
    if (curve < rules.minBondingCurve || curve > rules.maxBondingCurve) return false
    if (mcap > rules.maxMarketCapUsd) return false
    if (score > rules.maxSignalScore) return false
    return true
  }

  const tryTrade = async (
    token: PumpToken,
    reason: string,
    amountSol?: number,
    serverSignal?: AutoTradeSignal,
  ) => {
    if (!publicKey || !rules.enabled) return
    if (processing.current.has(token.mint)) return

    await hydrateMarketStateFromApi(token.mint)

    const decision = evaluateProbabilisticEntry(token.mint, rules)
    const trustServer =
      serverSignal &&
      (serverSignal.evScore ?? 0) >= 0.58 &&
      passesLegacy(token, serverSignal)

    if (!decision?.allowed && !trustServer) return

    const sizeSol =
      amountSol ??
      serverSignal?.positionSizeSol ??
      decision?.positionSizeSol ??
      rules.buyAmountSol
    processing.current.add(token.mint)

    const signal: AutoTradeSignal = {
      mint: token.mint,
      symbol: token.symbol,
      name: token.name,
      reason,
      bondingCurvePercent: token.bondingCurvePercent,
      marketCap: token.marketCap,
      signalScore: decision
        ? evScoreToSignalScore(decision.metrics)
        : Math.round((serverSignal?.evScore ?? 0.6) * 100),
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
      const { base64, positionSizeSol } = await buildSizedTransaction({
        publicKey: publicKey.toBase58(),
        action: 'buy',
        mint: token.mint,
        amountSol: sizeSol,
        slippage: rules.slippage,
        priorityFee: rules.priorityFee,
        pool: rules.pool,
        evConfidence: decision?.metrics.evScore ?? serverSignal?.evScore ?? 0.6,
      })

      const sig = await execute({
        mint: token.mint,
        action: 'buy',
        amountSol: positionSizeSol,
        slippage: rules.slippage,
        priorityFee: rules.priorityFee,
        pool: rules.pool,
        serializedTxBase64: base64,
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
      const ev = decision?.metrics.evScore ?? serverSignal?.evScore ?? 0.6
      globalMarketState.registerPosition(token.mint, sizeSol, ev)
      setPosition(token.mint, {
        entrySol: sizeSol,
        symbol: token.symbol,
        entryEvScore: ev,
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
    const unsubServer = wsService.onRegistryPatch((token) => {
      if (!rules.snipeNewTokens) return
      onToken(token)
    })
    const unsubSignal = wsService.onAutoTradeSignal((s) => {
      if (!rules.enabled) return
      void (async () => {
        await hydrateMarketStateFromApi(s.mint)
        const token = pumpTokenFromMint(s.mint, {
          symbol: s.symbol,
          name: s.name,
          marketCapSol: s.marketCap / 200,
        })
        await tryTrade(token, s.reason, s.positionSizeSol, s)
      })()
    })

    const unsubFeedPatch = wsService.onRegistryPatch((token) => {
      if (!rules.enabled || !token.isActive) return
      void hydrateMarketStateFromApi(token.mint)
    })

    const unsubExit = globalMarketState.onExit((mint, exit) => {
      if (!positions[mint] || !exit.shouldExit) return
      trySell(mint, exit.reasons.join(', '))
    })

    wsService.connect()

    void autoTraderApi
      .getRules()
      .then((serverRules) => {
        useAutoTraderStore.setState({ rules: { ...useAutoTraderStore.getState().rules, ...serverRules } })
      })
      .catch(() => undefined)

    return () => {
      unsubDirect()
      unsubServer()
      unsubSignal()
      unsubFeedPatch()
      unsubExit()
    }
  }, [rules.enabled, rules.snipeNewTokens, publicKey, positions, directPumpPortal])

  return { loading, rules }
}
