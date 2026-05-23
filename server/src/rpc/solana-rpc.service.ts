import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

export type RpcProviderId = 'helius' | 'quicknode' | 'triton' | 'custom' | 'public'

@Injectable()
export class SolanaRpcService {
  private readonly logger = new Logger(SolanaRpcService.name)
  private readonly rpcUrl: string
  readonly provider: RpcProviderId

  constructor(private config: ConfigService) {
    const heliusKey = this.config.get('HELIUS_API_KEY')?.trim()
    const quicknode = this.config.get('QUICKNODE_RPC_URL')?.trim()
    const triton = this.config.get('TRITON_RPC_URL')?.trim()
    const custom = this.config.get('SOLANA_RPC_URL')?.trim()

    if (custom) {
      this.rpcUrl = custom
      this.provider = custom.includes('helius')
        ? 'helius'
        : custom.includes('quiknode') || custom.includes('quicknode')
          ? 'quicknode'
          : 'custom'
    } else if (heliusKey) {
      this.rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
      this.provider = 'helius'
    } else if (quicknode) {
      this.rpcUrl = quicknode
      this.provider = 'quicknode'
    } else if (triton) {
      this.rpcUrl = triton
      this.provider = 'triton'
    } else {
      this.rpcUrl = 'https://api.mainnet-beta.solana.com'
      this.provider = 'public'
      if (process.env.NODE_ENV === 'production') {
        this.logger.warn(
          'No dedicated RPC configured — set HELIUS_API_KEY, QUICKNODE_RPC_URL, or SOLANA_RPC_URL',
        )
      }
    }
  }

  get url(): string {
    return this.rpcUrl
  }

  get isDedicated(): boolean {
    return this.provider !== 'public'
  }

  async rpc<T>(method: string, params: unknown[], timeoutMs = 45_000): Promise<T | null> {
    try {
      const { data } = await axios.post<{ result?: T; error?: { message: string } }>(
        this.rpcUrl,
        { jsonrpc: '2.0', id: 1, method, params },
        { timeout: timeoutMs },
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

  async getSignatureStatuses(signatures: string[]) {
    return this.rpc<{ value: Array<{ confirmationStatus?: string; err?: unknown } | null> }>(
      'getSignatureStatuses',
      [signatures, { searchTransactionHistory: true }],
      15_000,
    )
  }
}
