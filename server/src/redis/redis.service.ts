import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type Redis from 'ioredis'
import { normalizeRedisUrl, redisTlsOptions } from './redis-url'

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
  private invalidUrlWarned = false

  constructor(private config: ConfigService) {}

  get enabled(): boolean {
    if (this.config.get('REDIS_DISABLED') === 'true') return false
    return Boolean(this.resolveUrl())
  }

  private resolveUrl(): string | null {
    const raw = this.config.get('REDIS_URL')
    const url = normalizeRedisUrl(raw)
    if (raw?.trim() && !url && !this.invalidUrlWarned) {
      this.invalidUrlWarned = true
      this.logger.warn(
        'REDIS_URL is not a valid redis:// or rediss:// URL — use Upstash format only, not redis-cli flags. Example: rediss://default:TOKEN@xxx.upstash.io:6379',
      )
    }
    return url
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
    void this.connect()
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => undefined)
    await this.subscriber?.quit().catch(() => undefined)
    this.client = null
    this.subscriber = null
    this.connected = false
  }

  private attachErrorHandler(client: Redis, label: string) {
    client.on('error', (err) => {
      this.connected = false
      this.logger.debug(`Redis ${label}: ${err.message}`)
    })
  }

  private async connect(retries = 2) {
    const url = this.resolveUrl()
    if (!url) return

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { default: IORedis } = await import('ioredis')
        const opts = {
          maxRetriesPerRequest: 2,
          lazyConnect: true,
          enableReadyCheck: true,
          connectTimeout: 8_000,
          commandTimeout: 5_000,
          retryStrategy: () => null,
          tls: redisTlsOptions(url),
        }
        this.client = new IORedis(url, opts)
        this.attachErrorHandler(this.client, 'client')
        await Promise.race([
          this.client.connect(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Redis connect timeout (8s)')), 8_000),
          ),
        ])
        this.connected = true
        this.logger.log('Redis connected (Upstash/ioredis)')
        return
      } catch (err) {
        await this.client?.quit().catch(() => undefined)
        this.client = null
        if (attempt === retries) {
          this.logger.warn(`Redis unavailable: ${(err as Error).message}`)
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

  /** SET key value NX EX ttl — returns true if lock acquired. */
  async setNx(key: string, value: string, ttlSec: number): Promise<boolean> {
    if (!this.client || ttlSec <= 0) return false
    try {
      const result = await this.client.set(key, value, 'EX', ttlSec, 'NX')
      return result === 'OK'
    } catch (err) {
      this.logger.debug(`Redis setNx ${key}: ${(err as Error).message}`)
      return false
    }
  }

  /** Renew TTL only if current value matches owner (leader heartbeat). */
  async renewLock(key: string, owner: string, ttlSec: number): Promise<boolean> {
    if (!this.client || ttlSec <= 0) return false
    try {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("set", KEYS[1], ARGV[1], "EX", ARGV[2])
        else
          return 0
        end
      `
      const result = await this.client.eval(script, 1, key, owner, String(ttlSec))
      return result === 'OK'
    } catch (err) {
      this.logger.debug(`Redis renewLock ${key}: ${(err as Error).message}`)
      return false
    }
  }

  async deleteIfValue(key: string, value: string): Promise<void> {
    if (!this.client) return
    try {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `
      await this.client.eval(script, 1, key, value)
    } catch (err) {
      this.logger.debug(`Redis deleteIfValue ${key}: ${(err as Error).message}`)
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
    const url = this.resolveUrl()
    if (!url) return
    try {
      const { default: IORedis } = await import('ioredis')
      this.subscriber = new IORedis(url, {
        maxRetriesPerRequest: 2,
        lazyConnect: true,
        retryStrategy: () => null,
        tls: redisTlsOptions(url),
      })
      this.attachErrorHandler(this.subscriber, 'subscriber')
      await this.subscriber.connect()
      await this.subscriber.subscribe(channel)
      this.subscriber.on('message', (_ch, payload) => handler(payload))
    } catch (err) {
      this.logger.warn(`Redis subscribe failed: ${(err as Error).message}`)
    }
  }
}
