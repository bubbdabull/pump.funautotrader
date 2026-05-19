import { Body, Controller, Post } from '@nestjs/common'
import { AiService } from './ai.service'

@Controller('ai')
export class AiController {
  constructor(private ai: AiService) {}

  @Post('chat')
  chat(@Body() body: { message: string; context?: Record<string, unknown> }) {
    return this.ai.chat(body.message, body.context)
  }
}
