import { randomUUID } from 'crypto'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import type { FeedToken } from '../feed/feed.types'

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
    // Node 20 (Fly Docker) has no native WebSocket — @supabase/realtime-js requires `ws`
    this.client = createClient(url, key, {
      auth: { persistSession: false },
      realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
    })
    this.enabled = true
    this.logger.log('Supabase REST database connected (service role)')
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
