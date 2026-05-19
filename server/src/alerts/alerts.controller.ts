import { Controller, Get, Param, Patch } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SupabaseDbService } from '../supabase/supabase-db.service'

@Controller('alerts')
export class AlertsController {
  constructor(
    private prisma: PrismaService,
    private supabase: SupabaseDbService,
  ) {}

  @Get()
  async list() {
    if (this.prisma.enabled) {
      return this.prisma.alert.findMany({ orderBy: { triggeredAt: 'desc' }, take: 50 })
    }
    if (this.supabase.enabled) return this.supabase.listAlerts(50)
    return []
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string) {
    if (this.prisma.enabled) {
      return this.prisma.alert.update({ where: { id }, data: { read: true } })
    }
    if (this.supabase.enabled) return this.supabase.markAlertRead(id)
    return { id, read: true }
  }
}
