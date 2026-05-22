import { randomUUID } from 'crypto'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import type { FeedToken } from '../feed/feed.types'
import type { RugScoreBreakdown } from '@phronis/trading'
import type { QuantitativeScores } from '@phronis/trading'

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
    } catch (err) {
      this.logger.error(`Supabase init failed: ${(err as Error).message}`)
    }
  }

  async upsertToken(token: FeedToken) {
    if (!this.client) return
    const row = {
      mint: token.mint,
      name: token.name,
      symbol: token.symbol,
      image: token.image,
      marketCap: token.marketCap,
      bondingCurvePercent: token.bondingCurvePercent,
      holders: token.holders,
      volume24h: token.volume24h,
      aiRiskScore: token.signalScore,
      momentumScore: token.momentumScore,
      whaleActivity: token.whaleActivity,
      priceUsd: token.priceUsd,
      priceChange24h: token.priceChange24h,
      liquidity: token.liquidity,
      launchedAt: token.launchedAt,
      updatedAt: new Date().toISOString(),
    }
    const existing = await this.findTokenByMint(token.mint)
    if (existing) {
      const { error } = await this.client.from('Token').update(row).eq('mint', token.mint)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await this.client.from('Token').insert({ ...row, id: randomUUID() })
      if (error) throw new Error(error.message)
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
  ) {
    if (!this.client) return
    const { error } = await this.client.from('HolderSnapshot').insert({
      id: randomUUID(),
      mint,
      holders,
      top1Pct,
      top5Pct,
      entropy,
      capturedAt: new Date().toISOString(),
    })
    if (error) this.logger.debug(`HolderSnapshot insert: ${error.message}`)
  }

  async patchTokenQuant(
    mint: string,
    patch: { rugScore?: number; tradeConfidence?: number; holders?: number; creatorWallet?: string },
  ) {
    if (!this.client) return
    const { error } = await this.client
      .from('Token')
      .update({
        ...patch,
        updatedAt: new Date().toISOString(),
      })
      .eq('mint', mint)
    if (error) this.logger.debug(`Token quant patch: ${error.message}`)
  }

  async persistQuantSnapshot(
    mint: string,
    scores: QuantitativeScores,
    rug: RugScoreBreakdown,
    holders: number,
    holderMeta: { top1Pct: number; top5Pct: number; entropy: number },
    recentTrades: Parameters<SupabaseDbService['insertWalletActivities']>[1],
  ) {
    await Promise.all([
      this.insertRugScore(mint, rug),
      this.insertHolderSnapshot(mint, holders, holderMeta.top1Pct, holderMeta.top5Pct, holderMeta.entropy),
      this.insertWalletActivities(mint, recentTrades),
      this.patchTokenQuant(mint, {
        rugScore: rug.rugScore,
        tradeConfidence: scores.tradeConfidenceScore,
        holders,
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
