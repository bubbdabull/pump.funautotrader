import { Body, Controller, Post } from '@nestjs/common'
import { HeliusService } from './helius.service'

@Controller('helius')
export class HeliusController {
  constructor(private helius: HeliusService) {}

  @Post('webhook')
  webhook(@Body() body: unknown) {
    return this.helius.handleWebhook(body)
  }
}
