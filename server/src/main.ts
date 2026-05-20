import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import type { Response } from 'express'
import { AppModule } from './app.module'

function logBootConfig() {
  const flags = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    USE_SUPABASE_REST_DB: process.env.USE_SUPABASE_REST_DB,
    REDIS_DISABLED: process.env.REDIS_DISABLED,
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL?.trim()),
    hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    hasPumpPortalKey: Boolean(process.env.PUMPPORTAL_API_KEY?.trim()),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
  }
  console.log('[boot]', JSON.stringify(flags))
}

async function bootstrap() {
  logBootConfig()
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] })
  app.setGlobalPrefix('api')
  app.enableCors({ origin: true, credentials: true })
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))

  // GET / — not under /api (Nest global prefix exclude is unreliable for root)
  const express = app.getHttpAdapter().getInstance()
  express.get('/', (_req: unknown, res: Response) => {
    res.json({
      service: 'phronis-api',
      ok: true,
      health: '/api/health',
      pumpportalStatus: '/api/pumpportal/status',
      note: 'React UI is on Vercel; all API routes live under /api',
    })
  })

  const port = Number(process.env.PORT) || 8080
  const host = process.env.HOST || '0.0.0.0'
  if (!Number.isFinite(port) || port < 1) {
    throw new Error(`Invalid PORT env: ${process.env.PORT}`)
  }
  await app.listen(port, host)
  console.log(`[ready] Phronis API listening on http://${host}:${port}`)
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
