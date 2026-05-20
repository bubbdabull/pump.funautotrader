import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix('api')
  app.enableCors({ origin: true, credentials: true })
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
  const port = Number(process.env.PORT) || 3001
  const host = process.env.HOST || '0.0.0.0'
  await app.listen(port, host)
  console.log(`Phronis API listening on ${host}:${port}`)
}

bootstrap().catch((err) => {
  console.error('Failed to start:', err)
  process.exit(1)
})
