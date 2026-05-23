import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type Redis from 'ioredis'

export interface RedisZMember {
  member: string
  score: number
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  private client: Redis | null = null
  private subscriber: Redis | null = null
  private connected = false
  private lastPingMs: number | null = null

  constructor(private config: ConfigService) {}

  get enabled(): boolean {
    if (this.config.get('REDIS_DISABLED') === 'true') return false
    return Boolean(this.config.get('REDIS_URL')?.trim())
  }

  get isConnected(): boolean {
    return this.connected && this.client != null
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log(
        'Redis disabled — in-memory only (set REDIS_URL + REDIS_DISABLED=false for Upstash)',
      )
      return
    }
    await this.connect()
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => undefined)
    await this.subscriber?.quit().catch(() => undefined)
    this.client = null
    this.subscriber = null
    this.connected = false
  }

  private async connect(retries = 2) {
    const url = this.config.get('REDIS_URL')!.trim()
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { default: IORedis } = await import('ioredis')
        const opts = {
          maxRetriesPerRequest: 2,
          lazyConnect: true,
          enableReadyCheck: true,
          tls: url.startsWith('rediss://') ? {} : undefined,
        }
        this.client = new IORedis(url, opts)
        await this.client.connect()
        this.connected = true
        this.logger.log('Redis connected (Upstash/ioredis)')
        return
      } catch (err) {
        if (attempt === retries) {
          this.logger.warn(`Redis unavailable: ${(err as Error).message}`)
          this.client = null
          this.connected = false
        } else {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
        }
      }
    }
  }

  getClient(): Redis | null {
    return this.client
  }

  getStats() {
    return {
      enabled: this.enabled,
      connected: this.isConnected,
      lastPingMs: this.lastPingMs,
    }
  }

  /** Non-blocking wrapper for hot-path callers. */
  fireAndForget(task: () => Promise<void>): void {
    if (!this.enabled) return
    void task().catch((err) => {
      this.logger.debug(`Redis async: ${(err as Error).message}`)
    })
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false
    try {
      const t0 = Date.now()
      const pong = await this.client.ping()
      this.lastPingMs = Date.now() - t0
      return pong === 'PONG'
    } catch {
      this.connected = false
      return false
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null
    try {
      return await this.client.get(key)
    } catch (err) {
      this.logger.debug(`Redis get ${key}: ${(err as Error).message}`)
      return null
    }
  }

  async set(key: string, value: string, ttlSec?: number): Promise<void> {
    if (!this.client) return
    try {
      if (ttlSec && ttlSec > 0) {
        await this.client.set(key, value, 'EX', ttlSec)
      } else {
        await this.client.set(key, value)
      }
    } catch (err) {
      this.logger.debug(`Redis set ${key}: ${(err as Error).message}`)
    }
  }

  async zrevrangeWithScores(key: string, limit: number): Promise<RedisZMember[]> {
    if (!this.client || limit <= 0) return []
    try {
      const raw = await this.client.zrevrange(key, 0, limit - 1, 'WITHSCORES')
      const out: RedisZMember[] = []
      for (let i = 0; i < raw.length; i += 2) {
        const member = raw[i]
        const score = Number(raw[i + 1])
        if (member && Number.isFinite(score)) out.push({ member, score })
      }
      return out
    } catch (err) {
      this.logger.debug(`Redis zrevrange ${key}: ${(err as Error).message}`)
      return []
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    if (!this.client) return
    try {
      await this.client.publish(channel, message)
    } catch (err) {
      this.logger.debug(`Redis publish: ${(err as Error).message}`)
    }
  }

  async subscribe(channel: string, handler: (msg: string) => void): Promise<void> {
    if (!this.client || !this.enabled) return
    const url = this.config.get('REDIS_URL')!.trim()
    try {
      const { default: IORedis } = await import('ioredis')
      this.subscriber = new IORedis(url, {
        maxRetriesPerRequest: 2,
        lazyConnect: true,
        tls: url.startsWith('rediss://') ? {} : undefined,
      })
      await this.subscriber.connect()
      await this.subscriber.subscribe(channel)
      this.subscriber.on('message', (_ch, payload) => handler(payload))
    } catch (err) {
      this.logger.warn(`Redis subscribe failed: ${(err as Error).message}`)
    }
  }
}
