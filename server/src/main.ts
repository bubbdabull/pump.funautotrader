import { NestFactory } from '@nestjs/core'
import { RequestMethod, ValidationPipe } from '@nestjs/common'
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
  app.setGlobalPrefix('api', {
    exclude: [{ path: '/', method: RequestMethod.GET }],
  })
  app.enableCors({ origin: true, credentials: true })
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
  const port = Number(process.env.PORT) || 3001
  const host = process.env.HOST || '0.0.0.0'
  await app.listen(port, host)
  console.log(`Phronis API listening on ${host}:${port}`)
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
