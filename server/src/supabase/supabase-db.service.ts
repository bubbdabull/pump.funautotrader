import { randomUUID } from 'crypto'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import type { FeedToken } from '../feed/feed.types'
import type { FeedActivityFields, RugScoreBreakdown, QuantitativeScores } from '@phronis/trading'
import { passesTradeableFilter, tradeQualityScore } from '@phronis/trading'

@Injectable()
export class SupabaseDbService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseDbService.name)
  private client: SupabaseClient | null = null
  enabled = false

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('SUPABASE_URL')?.trim()
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim()
    if (!url || !key) {
      this.logger.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — REST DB disabled')
      return
    }
    if (key.startsWith('sb_publishable_')) {
      this.logger.error(
        'SUPABASE_SERVICE_ROLE_KEY looks like a publishable key — use service_role from Supabase → Settings → API',
      )
      return
    }
    // Do not await network here — Fly health checks need the HTTP port open immediately
    void this.connectInBackground(url, key)
  }

  private async connectInBackground(url: string, key: string) {
    try {
      const client = createClient(url, key, {
        auth: { persistSession: false },
        realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
      })
      const probe = client.from('Token').select('id').limit(1)
      const timeout = new Promise<{ error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ error: { message: 'Supabase probe timeout (8s)' } }), 8000),
      )
      const { error } = await Promise.race([probe, timeout])
      if (error) {
        this.logger.error(
          `Supabase key rejected (${error.message}). Use service_role from Supabase → Settings → API`,
        )
        return
      }
      this.client = client
      this.enabled = true
      this.logger.log('Supabase REST database connected (service role)')
      void this.runStartupFeedMaintenance()
    } catch (err) {
      this.logger.error(`Supabase init failed: ${(err as Error).message}`)
    }
  }

  /** Drop junk rows so DB only accumulates strict tradeable tokens over time. */
  private async runStartupFeedMaintenance() {
    if (!this.client) return
    if (this.config.get('SUPABASE_PURGE_FEED_ON_START') === 'true') {
      const n = await this.purgeAllFeedTokens()
      this.logger.warn(`Supabase feed purge (SUPABASE_PURGE_FEED_ON_START): removed ${n} tokens`)
      return
    }
    const removed = await this.purgeNonTradeableTokens()
    if (removed > 0) {
      this.logger.log(`Supabase: removed ${removed} non-tradeable token rows`)
    }
  }

  async purgeAllFeedTokens(): Promise<number> {
    if (!this.client) return 0
    const { count } = await this.client.from('Token').select('*', { count: 'exact', head: true })
    await this.client.from('Alert').delete().not('mint', 'is', null)
    await this.client.from('Trade').delete().neq('id', '')
    await this.client.from('HolderSnapshot').delete().neq('id', '')
    await this.client.from('RugScore').delete().neq('id', '')
    await this.client.from('WalletActivity').delete().neq('id', '')
    await this.client.from('Token').delete().neq('id', '')
    return count ?? 0
  }

  async purgeNonTradeableTokens(): Promise<number> {
    if (!this.client) return 0
    const { data: rows, error } = await this.client
      .from('Token')
      .select('mint')
      .eq('isTradeable', false)
    if (error || !rows?.length) return 0

    const mints = rows.map((r) => r.mint as string)
    for (let i = 0; i < mints.length; i += 80) {
      const chunk = mints.slice(i, i + 80)
      await Promise.all([
        this.client!.from('HolderSnapshot').delete().in('mint', chunk),
        this.client!.from('RugScore').delete().in('mint', chunk),
        this.client!.from('WalletActivity').delete().in('mint', chunk),
        this.client!.from('Alert').delete().in('mint', chunk),
      ])
    }
    await this.client.from('Token').delete().eq('isTradeable', false)
    return mints.length
  }

  async upsertToken(token: FeedToken) {
    if (!this.client) return
    const isTradeable = passesTradeableFilter(token)
    if (!isTradeable) return
    const row = {
      id: randomUUID(),
      mint: token.mint,
      name: token.name,
      symbol: token.symbol,
      image: token.image,
      metadataUri: token.metadataUri ?? null,
      twitter: token.twitter ?? null,
      telegram: token.telegram ?? null,
      website: token.website ?? null,
      marketCap: token.marketCap,
      bondingCurvePercent: token.bondingCurvePercent,
      holders: token.holders,
      holdersVerified: token.holdersVerified ?? false,
      volume24h: token.volume24h,
      aiRiskScore: token.signalScore,
      momentumScore: token.momentumScore,
      tradeQualityScore: tradeQualityScore(token),
      isTradeable,
      whaleActivity: token.whaleActivity,
      priceUsd: token.priceUsd,
      priceChange24h: token.priceChange24h,
      liquidity: token.liquidity,
      launchedAt: token.launchedAt,
      lastTradeAt: token.lastTradeAt ? new Date(token.lastTradeAt).toISOString() : null,
      trades1m: token.trades1m ?? 0,
      volume5mSol: token.volume5mSol ?? 0,
      buyPressure1m: token.buyPressure1m ?? 50,
      mcapChange5m: token.mcapChange5m ?? 0,
      isActive: token.isActive ?? false,
      updatedAt: new Date().toISOString(),
    }
    const { error } = await this.client.from('Token').upsert(row, { onConflict: 'mint' })
    if (error) {
      const existing = await this.findTokenByMint(token.mint)
      if (existing) {
        const { error: updErr } = await this.client
          .from('Token')
          .update({
            name: row.name,
            symbol: row.symbol,
            image: row.image,
            metadataUri: row.metadataUri,
            twitter: row.twitter,
            telegram: row.telegram,
            website: row.website,
            marketCap: row.marketCap,
            bondingCurvePercent: row.bondingCurvePercent,
            holders: row.holders,
            holdersVerified: row.holdersVerified,
            volume24h: row.volume24h,
            aiRiskScore: row.aiRiskScore,
            momentumScore: row.momentumScore,
            tradeQualityScore: row.tradeQualityScore,
            isTradeable: row.isTradeable,
            whaleActivity: row.whaleActivity,
            priceUsd: row.priceUsd,
            priceChange24h: row.priceChange24h,
            liquidity: row.liquidity,
            lastTradeAt: row.lastTradeAt,
            trades1m: row.trades1m,
            volume5mSol: row.volume5mSol,
            buyPressure1m: row.buyPressure1m,
            mcapChange5m: row.mcapChange5m,
            isActive: row.isActive,
            updatedAt: row.updatedAt,
          })
          .eq('mint', token.mint)
        if (updErr) throw new Error(updErr.message)
        return
      }
      throw new Error(error.message)
    }
  }

  async findTokenByMint(mint: string) {
    if (!this.client) return null
    const { data, error } = await this.client.from('Token').select('*').eq('mint', mint).maybeSingle()
    if (error) throw new Error(error.message)
    return data
  }

  async createAlert(data: {
    type: string
    title: string
    message: string
    mint?: string
  }) {
    if (!this.client) return
    const { error } = await this.client.from('Alert').insert({
      id: randomUUID(),
      type: data.type,
      title: data.title,
      message: data.message,
      mint: data.mint ?? null,
      read: false,
      triggeredAt: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
  }

  async listAlerts(limit = 50) {
    if (!this.client) return []
    const { data, error } = await this.client
      .from('Alert')
      .select('*')
      .order('triggeredAt', { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)
    return data ?? []
  }

  async markAlertRead(id: string) {
    if (!this.client) return { id, read: true }
    const { data, error } = await this.client
      .from('Alert')
      .update({ read: true })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  async createTrade(order: {
    mint: string
    side: string
    amountSol: number
    wallet: string
    txSig?: string
  }) {
    if (!this.client) return { ...order, id: 'offline', status: 'pending' }
    const { data, error } = await this.client
      .from('Trade')
      .insert({
        id: randomUUID(),
        mint: order.mint,
        wallet: order.wallet,
        side: order.side,
        amountSol: order.amountSol,
        txSig: order.txSig ?? null,
        status: order.txSig ? 'confirmed' : 'pending',
        createdAt: new Date().toISOString(),
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  async insertRugScore(mint: string, rug: RugScoreBreakdown) {
    if (!this.client) return
    const { error } = await this.client.from('RugScore').insert({
      id: randomUUID(),
      mint,
      rugScore: rug.rugScore,
      creatorRisk: rug.creatorRisk,
      holderConcentration: rug.holderConcentration,
      liquidityWeakness: rug.liquidityWeakness,
      suspiciousWallets: rug.suspiciousWallets,
      fakeVolumeProb: rug.fakeVolumeProbability,
      blocked: rug.blocked,
      reasons: rug.reasons,
      capturedAt: new Date().toISOString(),
    })
    if (error) this.logger.debug(`RugScore insert: ${error.message}`)
  }

  async insertWalletActivityOnce(
    mint: string,
    trade: {
      wallet: string
      side: string
      solAmount: number
      signature?: string
      slot?: number
      timestamp: number
    },
  ): Promise<boolean> {
    if (!this.client) return false
    if (trade.signature) {
      const { data } = await this.client
        .from('WalletActivity')
        .select('id')
        .eq('signature', trade.signature)
        .maybeSingle()
      if (data) return false
    }
    const { error } = await this.client.from('WalletActivity').insert({
      id: randomUUID(),
      mint,
      wallet: trade.wallet,
      side: trade.side,
      solAmount: trade.solAmount,
      signature: trade.signature ?? null,
      slot: trade.slot ?? null,
      actedAt: new Date(trade.timestamp).toISOString(),
    })
    if (error) {
      this.logger.debug(`WalletActivity insert: ${error.message}`)
      return false
    }
    return true
  }

  async patchTokenLiveActivity(
    mint: string,
    activity: FeedActivityFields,
    market?: { marketCap?: number; bondingCurvePercent?: number; volume24h?: number },
  ) {
    if (!this.client) return
    const payload: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      lastTradeAt: activity.lastTradeAt ? new Date(activity.lastTradeAt).toISOString() : null,
      trades1m: activity.trades1m,
      volume5mSol: activity.volume5mSol,
      buyPressure1m: activity.buyPressure1m,
      mcapChange5m: activity.mcapChange5m,
      isActive: activity.isActive,
    }
    if (market?.marketCap != null) payload.marketCap = market.marketCap
    if (market?.bondingCurvePercent != null) payload.bondingCurvePercent = market.bondingCurvePercent
    if (market?.volume24h != null) payload.volume24h = market.volume24h
    const { error } = await this.client.from('Token').update(payload).eq('mint', mint)
    if (error) this.logger.debug(`Token activity patch: ${error.message}`)
  }

  async listTradeableTokensForRehydrate(limit = 50) {
    if (!this.client) return []
    const { data, error } = await this.client
      .from('Token')
      .select('mint, symbol, name, marketCap, bondingCurvePercent, metadataUri, image')
      .eq('isTradeable', true)
      .order('updatedAt', { ascending: false })
      .limit(limit)
    if (error) {
      this.logger.debug(`listTradeableTokens: ${error.message}`)
      return []
    }
    return data ?? []
  }

  async loadRecentWalletActivity(mint: string, limit = 150) {
    if (!this.client) return []
    const { data, error } = await this.client
      .from('WalletActivity')
      .select('wallet, side, solAmount, signature, slot, actedAt')
      .eq('mint', mint)
      .order('actedAt', { ascending: true })
      .limit(limit)
    if (error) {
      this.logger.debug(`loadRecentWalletActivity: ${error.message}`)
      return []
    }
    return data ?? []
  }

  async countRecentTrades(sinceMs: number) {
    if (!this.client) return 0
    const since = new Date(sinceMs).toISOString()
    const { count, error } = await this.client
      .from('WalletActivity')
      .select('*', { count: 'exact', head: true })
      .gte('actedAt', since)
    if (error) return 0
    return count ?? 0
  }

  async countActiveTokens(sinceMs: number) {
    if (!this.client) return 0
    const since = new Date(sinceMs).toISOString()
    const { count, error } = await this.client
      .from('Token')
      .select('*', { count: 'exact', head: true })
      .gte('lastTradeAt', since)
    if (error) return 0
    return count ?? 0
  }

  async insertWalletActivities(
    mint: string,
    trades: Array<{
      wallet: string
      side: string
      solAmount: number
      signature?: string
      slot?: number
      timestamp: number
    }>,
  ) {
    if (!this.client || trades.length === 0) return
    const rows = trades.slice(-20).map((t) => ({
      id: randomUUID(),
      mint,
      wallet: t.wallet,
      side: t.side,
      solAmount: t.solAmount,
      signature: t.signature ?? null,
      slot: t.slot ?? null,
      actedAt: new Date(t.timestamp).toISOString(),
    }))
    const { error } = await this.client.from('WalletActivity').insert(rows)
    if (error) this.logger.debug(`WalletActivity insert: ${error.message}`)
  }

  async insertHolderSnapshot(
    mint: string,
    holders: number,
    top1Pct: number,
    top5Pct: number,
    entropy: number,
    meta?: { holdersVerified?: boolean; suspiciousClusterPct?: number },
  ) {
    if (!this.client) return
    const { error } = await this.client.from('HolderSnapshot').insert({
      id: randomUUID(),
      mint,
      holders,
      top1Pct,
      top5Pct,
      entropy,
      holdersVerified: meta?.holdersVerified ?? false,
      suspiciousClusterPct: meta?.suspiciousClusterPct ?? 0,
      capturedAt: new Date().toISOString(),
    })
    if (error) this.logger.debug(`HolderSnapshot insert: ${error.message}`)
  }

  async patchTokenQuant(
    mint: string,
    patch: {
      rugScore?: number
      tradeConfidence?: number
      holders?: number
      holdersVerified?: boolean
      creatorWallet?: string
      isTradeable?: boolean
      tradeQualityScore?: number
    },
  ) {
    if (!this.client) return
    const payload: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (patch.holders != null) payload.holders = patch.holders
    if (patch.holdersVerified != null) payload.holdersVerified = patch.holdersVerified
    if (patch.rugScore != null) payload.rugScore = patch.rugScore
    if (patch.tradeConfidence != null) payload.tradeConfidence = patch.tradeConfidence
    if (patch.creatorWallet != null) payload.creatorWallet = patch.creatorWallet
    if (patch.isTradeable != null) payload.isTradeable = patch.isTradeable
    if (patch.tradeQualityScore != null) payload.tradeQualityScore = patch.tradeQualityScore
    const { error } = await this.client.from('Token').update(payload).eq('mint', mint)
    if (error) this.logger.debug(`Token quant patch: ${error.message}`)
  }

  async persistQuantSnapshot(
    mint: string,
    scores: QuantitativeScores,
    rug: RugScoreBreakdown,
    holders: number,
    holderMeta: {
      top1Pct: number
      top5Pct: number
      entropy: number
      holdersVerified?: boolean
      suspiciousClusterPct?: number
    },
    recentTrades: Parameters<SupabaseDbService['insertWalletActivities']>[1],
    tokenPatch?: FeedToken,
  ) {
    const tradeable = tokenPatch ? passesTradeableFilter(tokenPatch) : false
    if (!tradeable) return
    await Promise.all([
      this.insertRugScore(mint, rug),
      this.insertHolderSnapshot(mint, holders, holderMeta.top1Pct, holderMeta.top5Pct, holderMeta.entropy, {
        holdersVerified: holderMeta.holdersVerified,
        suspiciousClusterPct: holderMeta.suspiciousClusterPct,
      }),
      this.insertWalletActivities(mint, recentTrades),
      this.patchTokenQuant(mint, {
        rugScore: rug.rugScore,
        tradeConfidence: scores.tradeConfidenceScore,
        holders,
        holdersVerified: holderMeta.holdersVerified,
        isTradeable: tradeable,
        tradeQualityScore: tokenPatch ? tradeQualityScore(tokenPatch) : undefined,
      }),
    ])
  }

  async listSmartWallets(limit = 20) {
    if (!this.client) return []
    const { data, error } = await this.client
      .from('SmartWallet')
      .select('*')
      .order('pnl24h', { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)
    return data ?? []
  }
}
