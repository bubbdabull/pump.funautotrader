import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Radio,
  Bot,
  Wallet,
  Briefcase,
  Zap,
  Bell,
  Settings,
  ChevronLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/appStore'
import { useAutoTraderStore } from '@/stores/autoTraderStore'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/feed', icon: Radio, label: 'Live Feed' },
  { to: '/autotrader', icon: Bot, label: 'Auto Trader' },
  { to: '/wallets', icon: Wallet, label: 'Smart Wallets' },
  { to: '/portfolio', icon: Briefcase, label: 'Portfolio' },
  { to: '/strategies', icon: Zap, label: 'Strategies' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useAppStore()
  const enabled = useAutoTraderStore((s) => s.rules.enabled)

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 72 : 240 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="relative z-20 flex h-full flex-col border-r border-white/5 glass"
    >
      <div className="flex h-16 items-center gap-3 border-b border-white/5 px-4">
        <motion.div
          whileHover={{ rotate: 180, scale: 1.1 }}
          transition={{ duration: 0.5 }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 glow-teal"
        >
          <Zap className="h-5 w-5 text-white" />
        </motion.div>
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="min-w-0"
            >
              <p className="truncate text-sm font-bold tracking-tight text-white">Phronis</p>
              <p className="text-[10px] uppercase tracking-widest text-teal-400">Auto Trader</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}>
            {({ isActive }) => (
              <motion.div
                whileHover={{ x: 4 }}
                className={cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
                  isActive
                    ? 'bg-gradient-to-r from-emerald-600/20 to-teal-600/10 text-white'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 rounded-xl border border-teal-500/30"
                  />
                )}
                <Icon className={cn('relative z-10 h-5 w-5 shrink-0', isActive ? 'text-teal-400' : '')} />
                <AnimatePresence>
                  {!sidebarCollapsed && (
                    <motion.span className="relative z-10 font-medium">
                      {label}
                      {to === '/autotrader' && enabled && (
                        <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      )}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={toggleSidebar}
        className="m-3 flex items-center justify-center rounded-lg border border-white/5 p-2 text-zinc-500 hover:border-teal-500/30"
      >
        <ChevronLeft className={cn('h-4 w-4 transition-transform', sidebarCollapsed && 'rotate-180')} />
      </button>
    </motion.aside>
  )
}
