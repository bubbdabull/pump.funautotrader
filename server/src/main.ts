import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { ExpressAdapter } from '@nestjs/platform-express'
import { IoAdapter } from '@nestjs/platform-socket.io'
import express from 'express'
import { createServer } from 'http'
import type { Response } from 'express'
import { AppModule } from './app.module'
import { PersistWorkerModule } from './persist-worker.module'
import { resolveBootRole } from './process-role'

/** Fly http_service.internal_port is 8080; ignore PORT secrets that point at local dev. */
function resolveListenPort(): number {
  if (process.env.FLY_APP_NAME && resolveBootRole() === 'api') return 8080
  const n = Number(process.env.PORT)
  return Number.isFinite(n) && n >= 1 ? n : 8080
}

/** Fly proxy requires 0.0.0.0 — HOST from secrets sync can be 127.0.0.1. */
function resolveListenHost(): string {
  if (process.env.FLY_APP_NAME && resolveBootRole() === 'api') return '0.0.0.0'
  return process.env.HOST?.trim() || '0.0.0.0'
}

function logBootConfig() {
  const flags = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    FLY_PROCESS_GROUP: process.env.FLY_PROCESS_GROUP,
    PHRONIS_PROCESS_ROLE: process.env.PHRONIS_PROCESS_ROLE,
    bootRole: resolveBootRole(),
    USE_SUPABASE_REST_DB: process.env.USE_SUPABASE_REST_DB,
    REDIS_DISABLED: process.env.REDIS_DISABLED,
    BULL_DISABLED: process.env.BULL_DISABLED,
    hasRedisUrl: Boolean(process.env.REDIS_URL?.trim()),
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL?.trim()),
    hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    hasPumpPortalKey: Boolean(process.env.PUMPPORTAL_API_KEY?.trim()),
    hasHeliusKey: Boolean(process.env.HELIUS_API_KEY?.trim()),
    rpcUrl: Boolean(process.env.SOLANA_RPC_URL?.trim()),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
  }
  console.log('[boot]', JSON.stringify(flags))
}

function listenHttp(server: ReturnType<typeof createServer>, host: string, port: number) {
  return new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve())
    server.once('error', reject)
  })
}

async function bootstrapPersistWorker() {
  logBootConfig()
  await NestFactory.createApplicationContext(PersistWorkerModule, {
    logger: ['error', 'warn', 'log'],
    abortOnError: false,
  })
  console.log('[ready] Phronis persist worker — async Supabase drain active')
}

async function bootstrapApi() {
  logBootConfig()
  const host = resolveListenHost()
  const port = resolveListenPort()

  if (process.env.FLY_APP_NAME && String(process.env.PORT) !== String(port)) {
    console.warn(
      `[boot] Fly: ignoring PORT=${process.env.PORT} — proxy expects ${port}. Unset PORT in fly secrets.`,
    )
  }

  const expressApp = express()
  let nestReady = false
  const healthJson = () => ({
    ok: true,
    service: 'phronis-api',
    booting: !nestReady,
    bootRole: resolveBootRole(),
    flyProcessGroup: process.env.FLY_PROCESS_GROUP,
    at: new Date().toISOString(),
  })

  /** Fly probe must answer even when Nest/PumpPortal block the event loop during boot. */
  function handleFlyProbe(req: import('http').IncomingMessage, res: import('http').ServerResponse) {
    const path = req.url?.split('?')[0]
    if (path !== '/health' && path !== '/api/health') return false
    res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' })
    res.end(JSON.stringify({ ok: true, probe: true, booting: !nestReady }))
    return true
  }

  expressApp.get(['/api/health', '/health'], (_req, res: Response) => {
    res.status(200).json(healthJson())
  })
  expressApp.get('/', (_req, res: Response) => {
    res.status(200).json({ ...healthJson(), health: '/api/health' })
  })

  const httpServer = createServer((req, res) => {
    if (handleFlyProbe(req, res)) return
    expressApp(req, res)
  })
  await listenHttp(httpServer, host, port)
  console.log(`[boot] HTTP bound on http://${host}:${port} (Fly health can pass while Nest loads)`)

  try {
    const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
      logger: ['error', 'warn', 'log'],
      abortOnError: false,
    })
    app.useWebSocketAdapter(new IoAdapter(httpServer))
    app.setGlobalPrefix('api')
    app.enableCors({ origin: true, credentials: true })
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))

    expressApp.get('/', (_req: unknown, res: Response) => {
      res.json({
        service: 'phronis-api',
        ok: true,
        health: '/api/health',
        pumpportalStatus: '/api/pumpportal/status',
        bootRole: resolveBootRole(),
        note: 'React UI is on Vercel; all API routes live under /api',
      })
    })

    await app.init()
    nestReady = true
    console.log(`[ready] Phronis API initialized on http://${host}:${port} (role=${resolveBootRole()})`)
  } catch (err) {
    console.error(
      '[boot] Nest init failed — keeping HTTP alive for Fly health checks:',
      err instanceof Error ? err.stack ?? err.message : err,
    )
  }
}

async function bootstrap() {
  const role = resolveBootRole()
  if (role === 'persist') {
    await bootstrapPersistWorker()
    return
  }
  await bootstrapApi()
}

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.stack ?? reason.message : String(reason)
  console.error('[unhandledRejection] (process continues)', msg)
})

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] (process continues)', err.stack ?? err.message)
})

bootstrap().catch((err) => {
  console.error('Failed to start:', err)
  process.exit(1)
})
