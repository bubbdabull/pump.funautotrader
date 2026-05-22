import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { distributionFromAmounts, type OnChainHolderSnapshot } from '@phronis/trading'

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const MAX_PROGRAM_ACCOUNTS = 2500

interface ParsedTokenAccount {
  owner: string
  amount: number
}

@Injectable()
export class HeliusService {
  private readonly logger = new Logger(HeliusService.name)
  private readonly apiKey: string
  private readonly rpcUrl: string

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get('HELIUS_API_KEY')?.trim() || ''
    this.rpcUrl =
      this.config.get('SOLANA_RPC_URL')?.trim() ||
      (this.apiKey
        ? `https://mainnet.helius-rpc.com/?api-key=${this.apiKey}`
        : 'https://api.mainnet-beta.solana.com')
  }

  get enabled(): boolean {
    return Boolean(this.rpcUrl)
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T | null> {
    try {
      const { data } = await axios.post<{ result?: T; error?: { message: string } }>(
        this.rpcUrl,
        { jsonrpc: '2.0', id: 1, method, params },
        { timeout: 25_000 },
      )
      if (data.error) {
        this.logger.debug(`RPC ${method}: ${data.error.message}`)
        return null
      }
      return data.result ?? null
    } catch (err) {
      this.logger.debug(`RPC ${method} failed: ${(err as Error).message}`)
      return null
    }
  }

  /**
   * Count SPL holders with uiAmount > 0, excluding bonding-curve / pool wallets.
   */
  async fetchMintHolderSnapshot(
    mint: string,
    excludeWallets: string[] = [],
  ): Promise<OnChainHolderSnapshot | null> {
    const exclude = new Set(excludeWallets.filter(Boolean))

    const programAccounts = await this.fetchProgramTokenAccounts(mint)
    const amounts: number[] = []
    let holders = 0

    for (const acc of programAccounts) {
      if (acc.amount <= 0) continue
      if (exclude.has(acc.owner)) continue
      holders++
      amounts.push(acc.amount)
    }

    if (holders === 0) {
      const largest = await this.rpc<{
        value: { address: string; uiAmount: number; uiAmountString: string }[]
      }>('getTokenLargestAccounts', [mint])
      if (largest?.value?.length) {
        for (const row of largest.value) {
          const amt = Number(row.uiAmount ?? row.uiAmountString ?? 0)
          if (amt <= 0) continue
          holders++
          amounts.push(amt)
        }
      }
    }

    if (holders === 0 || amounts.length === 0) return null

    const dist = distributionFromAmounts(amounts)

    return {
      holders,
      top1Pct: dist.top1Pct,
      top5Pct: dist.top5Pct,
      entropy: dist.entropy,
      source: 'helius',
      verified: true,
      updatedAt: Date.now(),
    }
  }

  private async fetchProgramTokenAccounts(mint: string): Promise<ParsedTokenAccount[]> {
    const result = await this.rpc<{ value: unknown[] }>('getProgramAccounts', [
      TOKEN_PROGRAM,
      {
        encoding: 'jsonParsed',
        filters: [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: mint } },
        ],
      },
    ])

    const value = result?.value ?? []
    if (value.length > MAX_PROGRAM_ACCOUNTS) {
      this.logger.debug(
        `Mint ${mint.slice(0, 8)}… has ${value.length}+ token accounts (capped)`,
      )
    }

    const out: ParsedTokenAccount[] = []
    for (const entry of value.slice(0, MAX_PROGRAM_ACCOUNTS)) {
      const parsed = (entry as { account?: { data?: { parsed?: { info?: Record<string, unknown> } } } })
        ?.account?.data?.parsed?.info
      if (!parsed) continue
      const owner = String(parsed.owner ?? '')
      const tokenAmount = parsed.tokenAmount as { uiAmount?: number; uiAmountString?: string } | undefined
      const amount = Number(tokenAmount?.uiAmount ?? tokenAmount?.uiAmountString ?? 0)
      if (!owner || amount <= 0) continue
      out.push({ owner, amount })
    }
    return out
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
