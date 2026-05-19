import { useEffect, useState } from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'

interface AnimatedCounterProps {
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  className?: string
}

export function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  className,
}: AnimatedCounterProps) {
  const spring = useSpring(value, { stiffness: 100, damping: 30 })
  const display = useTransform(spring, (v) => `${prefix}${v.toFixed(decimals)}${suffix}`)
  const [text, setText] = useState(`${prefix}${value.toFixed(decimals)}${suffix}`)

  useEffect(() => {
    spring.set(value)
    return display.on('change', (v) => setText(v))
  }, [value, spring, display, prefix, suffix, decimals])

  return (
    <motion.span className={className} key={value}>
      {text}
    </motion.span>
  )
}
