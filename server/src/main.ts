import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { ExpressAdapter } from '@nestjs/platform-express'
import express from 'express'
import { createServer } from 'http'
import type { Response } from 'express'
import { AppModule } from './app.module'
import { PersistWorkerModule } from './persist-worker.module'
import { getProcessRole } from './process-role'

/** Fly http_service.internal_port is 8080; secrets sync often copies local PORT=3001. */
function resolveListenPort(): number {
  if (process.env.FLY_APP_NAME) return 8080
  const n = Number(process.env.PORT)
  return Number.isFinite(n) && n >= 1 ? n : 8080
}

function logBootConfig() {
  const flags = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    processRole: getProcessRole(),
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
  const host = process.env.HOST || '0.0.0.0'
  const port = resolveListenPort()

  if (process.env.FLY_APP_NAME && String(process.env.PORT) !== String(port)) {
    console.warn(
      `[boot] Fly: ignoring PORT=${process.env.PORT} — proxy expects ${port}. Remove PORT from fly secrets.`,
    )
  }

  const expressApp = express()
  expressApp.get(['/api/health', '/health'], (_req, res: Response) => {
    res.status(200).json({
      ok: true,
      service: 'phronis-api',
      booting: true,
      processRole: getProcessRole(),
      at: new Date().toISOString(),
    })
  })
  expressApp.get('/', (_req, res: Response) => {
    res.status(200).json({
      service: 'phronis-api',
      ok: true,
      health: '/api/health',
      booting: true,
      processRole: getProcessRole(),
    })
  })

  const httpServer = createServer(expressApp)
  await listenHttp(httpServer, host, port)
  console.log(`[boot] HTTP bound on http://${host}:${port} (Fly health can pass while Nest loads)`)

  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    logger: ['error', 'warn', 'log'],
    abortOnError: false,
  })
  app.setGlobalPrefix('api')
  app.enableCors({ origin: true, credentials: true })
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))

  expressApp.get('/', (_req: unknown, res: Response) => {
    res.json({
      service: 'phronis-api',
      ok: true,
      health: '/api/health',
      pumpportalStatus: '/api/pumpportal/status',
      processRole: getProcessRole(),
      note: 'React UI is on Vercel; all API routes live under /api',
    })
  })

  await app.init()
  console.log(`[ready] Phronis API initialized on http://${host}:${port} (role=${getProcessRole()})`)
}

async function bootstrap() {
  const role = getProcessRole()
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
