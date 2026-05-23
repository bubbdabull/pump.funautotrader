import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
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

async function bootstrapPersistWorker() {
  logBootConfig()
  const ctx = await NestFactory.createApplicationContext(PersistWorkerModule, {
    logger: ['error', 'warn', 'log'],
  })
  console.log('[ready] Phronis persist worker — async Supabase drain active')
  return ctx
}

async function bootstrapApi() {
  logBootConfig()
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] })
  app.setGlobalPrefix('api')
  app.enableCors({ origin: true, credentials: true })
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))

  const express = app.getHttpAdapter().getInstance()
  express.get('/', (_req: unknown, res: Response) => {
    res.json({
      service: 'phronis-api',
      ok: true,
      health: '/api/health',
      pumpportalStatus: '/api/pumpportal/status',
      processRole: getProcessRole(),
      note: 'React UI is on Vercel; all API routes live under /api',
    })
  })

  const host = process.env.HOST || '0.0.0.0'
  const port = resolveListenPort()
  if (process.env.FLY_APP_NAME && String(process.env.PORT) !== String(port)) {
    console.warn(
      `[boot] Fly: ignoring PORT=${process.env.PORT} — proxy expects ${port}. Remove PORT from fly secrets.`,
    )
  }
  await app.listen(port, host)
  console.log(`[ready] Phronis API listening on http://${host}:${port} (role=${getProcessRole()})`)
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
  console.error('[unhandledRejection]', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err)
})

bootstrap().catch((err) => {
  console.error('Failed to start:', err)
  process.exit(1)
})
