import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SupabaseDbService } from '../supabase/supabase-db.service'

@Injectable()
export class WalletsService {
  constructor(
    private prisma: PrismaService,
    private supabase: SupabaseDbService,
  ) {}

  async getSmartWallets() {
    if (!this.prisma.enabled) {
      if (this.supabase.enabled) {
        const wallets = await this.supabase.listSmartWallets(20)
        if (wallets.length) return wallets.map((w) => this.format(w as Parameters<typeof this.format>[0]))
      }
      return this.mockWallets()
    }
    const wallets = await this.prisma.smartWallet.findMany({ orderBy: { pnl24h: 'desc' }, take: 20 })
    if (wallets.length) return wallets.map(this.format)
    return this.mockWallets()
  }

  private mockWallets() {
    return [
      {
        address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        label: 'Solana God',
        pnl24h: 42300,
        pnl7d: 189000,
        roi30d: 340,
        winRate: 78,
        recentBuys: 12,
        recentSells: 4,
        followers: 2840,
        tier: 'elite',
      },
    ]
  }

  private format(w: {
    address: string
    label: string
    pnl24h: number
    pnl7d: number
    roi30d: number
    winRate: number
    tier: string
    followers: number
  }) {
    return {
      ...w,
      recentBuys: Math.floor(Math.random() * 20),
      recentSells: Math.floor(Math.random() * 15),
    }
  }
}
