import { PageTransition } from '@/components/shared/PageTransition'
import { GlassCard } from '@/components/shared/GlassCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function SettingsPage() {
  return (
    <PageTransition>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-zinc-500">Terminal preferences & API configuration</p>
      </div>

      <div className="max-w-xl space-y-4">
        <GlassCard>
          <h3 className="mb-4 font-semibold text-white">Trading Defaults</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500">Default Slippage %</label>
              <Input defaultValue="1" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Priority Fee (SOL)</label>
              <Input defaultValue="0.001" className="mt-1" />
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="mb-4 font-semibold text-white">API Keys</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500">Helius API Key</label>
              <Input type="password" placeholder="••••••••" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Jupiter API Key</label>
              <Input type="password" placeholder="••••••••" className="mt-1" />
            </div>
          </div>
          <Button className="mt-4">Save Settings</Button>
        </GlassCard>
      </div>
    </PageTransition>
  )
}
