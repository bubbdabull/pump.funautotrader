import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Radio, Bot, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAutoTraderStore } from '@/stores/autoTraderStore'

const items = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/feed', icon: Radio, label: 'Scanner' },
  { to: '/autotrader', icon: Bot, label: 'Bot' },
  { to: '/portfolio', icon: Briefcase, label: 'Portfolio' },
]

export function MobileNav() {
  const enabled = useAutoTraderStore((s) => s.rules.enabled)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0a0c10]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden">
      <div className="flex justify-around px-2 py-2">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'} className="flex min-w-[4rem] flex-col items-center gap-0.5">
            {({ isActive }) => (
              <>
                <Icon
                  className={cn('h-5 w-5', isActive ? 'text-teal-400' : 'text-zinc-500')}
                />
                <span
                  className={cn(
                    'text-[10px] font-medium',
                    isActive ? 'text-teal-400' : 'text-zinc-500',
                  )}
                >
                  {label}
                </span>
                {to === '/autotrader' && enabled && (
                  <span className="absolute top-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
