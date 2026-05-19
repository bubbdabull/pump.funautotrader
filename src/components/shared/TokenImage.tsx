import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { resolveTokenImageCandidates } from '@trading'

interface TokenImageProps {
  mint: string
  symbol?: string
  uri?: string
  image?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeClass = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-16 w-16 text-base',
}

export function TokenImage({ mint, symbol, uri, image, className, size = 'md' }: TokenImageProps) {
  const candidates = useMemo(
    () => resolveTokenImageCandidates(mint, { uri, image }),
    [mint, uri, image],
  )
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setIndex(0)
    setFailed(false)
  }, [mint, uri, image])

  const label = (symbol ?? mint.slice(0, 2)).toUpperCase()

  if (failed || index >= candidates.length) {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-purple-600/40 to-teal-600/30 font-bold text-white',
          sizeClass[size],
          className,
        )}
      >
        {label.slice(0, 2)}
      </div>
    )
  }

  return (
    <img
      src={candidates[index]}
      alt={symbol ?? mint}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={cn(
        'shrink-0 rounded-xl border border-white/10 object-cover bg-white/5',
        sizeClass[size],
        className,
      )}
      onError={() => {
        if (index + 1 < candidates.length) setIndex((i) => i + 1)
        else setFailed(true)
      }}
    />
  )
}
