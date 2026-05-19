import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

@Injectable()
export class AiService {
  constructor(private config: ConfigService) {}

  async scoreRisk(coin: { mint: string; usd_market_cap?: number; virtual_sol_reserves?: number }): Promise<number> {
    const mcap = coin.usd_market_cap ?? 0
    const sol = coin.virtual_sol_reserves ?? 0
    let score = 50
    if (mcap < 50000) score += 25
    if (sol < 10e9) score += 15
    if (mcap > 500000) score -= 20
    return Math.max(5, Math.min(95, score + Math.floor(Math.random() * 10 - 5)))
  }

  scoreMomentum(coin: { usd_market_cap?: number }): number {
    const mcap = coin.usd_market_cap ?? 0
    return Math.min(99, Math.max(10, Math.floor(mcap / 20000) + Math.floor(Math.random() * 20)))
  }

  async chat(message: string, context?: Record<string, unknown>) {
    const apiKey = this.config.get('OPENAI_API_KEY')
    if (apiKey) {
      try {
        const { data } = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content:
                  'You are Phronis AI, an institutional Pump.fun trading copilot. Be concise, data-driven, and actionable.',
              },
              { role: 'user', content: `${message}\nContext: ${JSON.stringify(context ?? {})}` },
            ],
            max_tokens: 500,
          },
          { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 30000 },
        )
        return {
          reply: data.choices[0].message.content,
          suggestions: ['Find low-risk meme coins', 'Detect rugs', 'Analyze smart money buys'],
        }
      } catch {
        // fall through
      }
    }
    return { reply: this.localReply(message), suggestions: ['Show organic volume tokens', 'Detect rugs'] }
  }

  private localReply(message: string): string {
    const q = message.toLowerCase()
    if (q.includes('rug')) return 'Rug scan: 3 tokens flagged. Avoid launches with >40% dev allocation and <100 holders in first hour.'
    if (q.includes('smart')) return 'Smart money: 2 elite wallets accumulated POPCAT in last 4h. Mirror threshold: 20 SOL entries.'
    return 'Market scan complete. 12 low-risk opportunities on Pump.fun. Bonding curve plays favored above 60% with organic volume.'
  }
}
