import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  glow?: 'purple' | 'blue' | 'teal' | 'none'
  onClick?: () => void
}

export function GlassCard({ children, className, hover = true, glow = 'none', onClick }: GlassCardProps) {
  return (
    <motion.div
      whileHover={hover ? { y: -2, transition: { duration: 0.2 } } : undefined}
      onClick={onClick}
      className={cn(
        'glass rounded-xl p-4',
        hover && 'glass-hover cursor-default',
        glow === 'purple' && 'glow-purple',
        glow === 'blue' && 'glow-blue',
        glow === 'teal' && 'glow-teal',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </motion.div>
  )
}
