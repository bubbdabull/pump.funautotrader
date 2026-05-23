import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { distributionFromAmounts, type OnChainHolderSnapshot } from '@phronis/trading'
import { SolanaRpcService } from '../rpc/solana-rpc.service'

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

@Injectable()
export class HeliusService {
  private readonly logger = new Logger(HeliusService.name)
  private readonly apiKey: string

  constructor(
    private config: ConfigService,
    private solanaRpc: SolanaRpcService,
  ) {
    this.apiKey = this.config.get('HELIUS_API_KEY')?.trim() || ''
  }

  get enabled(): boolean {
    return Boolean(this.apiKey?.trim()) || this.solanaRpc.isDedicated
  }

  get rpcConfigured(): boolean {
    return this.solanaRpc.isDedicated
  }

  get rpcProvider(): string {
    return this.solanaRpc.provider
  }

  /**
   * Count unique SPL holders (paginated GPA v2).
   * Bonding-curve pump tokens often have 0 token accounts until curve matures — returns null
   * so caller can use live trade-stream counts instead of the 20-account largest-accounts cap.
   */
  async fetchMintHolderSnapshot(
    mint: string,
    excludeWallets: string[] = [],
  ): Promise<OnChainHolderSnapshot | null> {
    const exclude = new Set(excludeWallets.filter(Boolean))
    const counted = await this.fetchUniqueOwnersPaginated(mint, exclude)
    if (!counted || counted.holders === 0) return null

    const dist = distributionFromAmounts(counted.amounts)
    return {
      holders: counted.holders,
      top1Pct: dist.top1Pct,
      top5Pct: dist.top5Pct,
      entropy: dist.entropy,
      source: 'helius',
      verified: true,
      updatedAt: Date.now(),
    }
  }

  private async fetchUniqueOwnersPaginated(
    mint: string,
    exclude: Set<string>,
  ): Promise<{ holders: number; amounts: number[] } | null> {
    const owners = new Map<string, number>()
    let paginationKey: string | undefined
    let pages = 0
    const maxPages = Number(this.config.get('HELIUS_GPA_MAX_PAGES') ?? 15)

    while (pages < maxPages) {
      const opts: Record<string, unknown> = {
        encoding: 'jsonParsed',
        filters: [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: mint } },
        ],
        limit: 1000,
      }
      if (paginationKey) opts.paginationKey = paginationKey

      const result = await this.solanaRpc.rpc<{
        accounts?: unknown[]
        paginationKey?: string
      }>('getProgramAccountsV2', [TOKEN_PROGRAM, opts])

      if (!result) break

      const accounts = result.accounts ?? []
      for (const entry of accounts) {
        const parsed = (
          entry as { account?: { data?: { parsed?: { info?: Record<string, unknown> } } } }
        )?.account?.data?.parsed?.info
        if (!parsed) continue
        const owner = String(parsed.owner ?? '')
        const tokenAmount = parsed.tokenAmount as
          | { uiAmount?: number; uiAmountString?: string }
          | undefined
        const amount = Number(tokenAmount?.uiAmount ?? tokenAmount?.uiAmountString ?? 0)
        if (!owner || amount <= 0 || exclude.has(owner)) continue
        owners.set(owner, (owners.get(owner) ?? 0) + amount)
      }

      paginationKey = result.paginationKey
      pages++
      if (!paginationKey || accounts.length === 0) break
    }

    if (owners.size === 0) return null

    const amounts = [...owners.values()]
    if (pages > 1) {
      this.logger.debug(`Mint ${mint.slice(0, 8)}… ${owners.size} holders (${pages} GPA pages)`)
    }
    return { holders: owners.size, amounts }
  }

  async parseTransaction(signature: string) {
    if (!this.apiKey) return null
    try {
      const { data } = await axios.post(
        `https://api.helius.xyz/v0/transactions/?api-key=${this.apiKey}`,
        { transactions: [signature] },
        { timeout: 10000 },
      )
      return data[0]
    } catch (err) {
      this.logger.warn(`Helius parse error: ${(err as Error).message}`)
      return null
    }
  }

  handleWebhook(payload: unknown) {
    this.logger.log(`Helius webhook received: ${JSON.stringify(payload).slice(0, 200)}`)
    return { ok: true }
  }
}
