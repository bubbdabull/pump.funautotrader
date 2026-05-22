import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

type FlashDir = 'up' | 'down' | 'neutral'

interface LiveValueProps {
  value: number | string
  className?: string
  children?: ReactNode
}

export function LiveValue({ value, className, children }: LiveValueProps) {
  const prev = useRef(value)
  const [flash, setFlash] = useState<FlashDir | null>(null)

  useEffect(() => {
    if (prev.current === value) return
    const prevNum = Number(prev.current)
    const nextNum = Number(value)
    if (!Number.isNaN(prevNum) && !Number.isNaN(nextNum) && prevNum !== nextNum) {
      setFlash(nextNum > prevNum ? 'up' : 'down')
      const t = setTimeout(() => setFlash(null), 700)
      prev.current = value
      return () => clearTimeout(t)
    }
    prev.current = value
  }, [value])

  return (
    <motion.span
      className={cn(
        'inline-block rounded px-0.5 transition-colors duration-300',
        flash === 'up' && 'live-flash-up',
        flash === 'down' && 'live-flash-down',
        className,
      )}
      layout
    >
      {children ?? value}
    </motion.span>
  )
}
