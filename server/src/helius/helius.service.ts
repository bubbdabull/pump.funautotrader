import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

@Injectable()
export class HeliusService {
  private readonly logger = new Logger(HeliusService.name)
  private readonly apiKey: string

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get('HELIUS_API_KEY') || ''
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
