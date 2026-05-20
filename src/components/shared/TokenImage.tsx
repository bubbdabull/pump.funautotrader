import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  isLikelyMetadataUri,
  normalizeIpfsUrl,
  resolveTokenImageCandidates,
} from '@trading'

interface TokenImageProps {
  mint: string
  symbol?: string
  uri?: string
  image?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeClass = {
  sm: 'h-9 w-9 text-[10px]',
  md: 'h-12 w-12 text-sm',
  lg: 'h-16 w-16 text-base',
}

export function TokenImage({ mint, symbol, uri, image, className, size = 'md' }: TokenImageProps) {
  const [resolvedFromMeta, setResolvedFromMeta] = useState<string | null>(null)
  const candidates = useMemo(() => {
    const base = resolveTokenImageCandidates(mint, { uri, image })
    if (resolvedFromMeta && !base.includes(resolvedFromMeta)) {
      return [resolvedFromMeta, ...base]
    }
    return base
  }, [mint, uri, image, resolvedFromMeta])

  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setIndex(0)
    setFailed(false)
    setResolvedFromMeta(null)
  }, [mint, uri, image])

  useEffect(() => {
    if (!uri || !isLikelyMetadataUri(uri)) return
    let cancelled = false
    const url = normalizeIpfsUrl(uri)
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((meta: Record<string, unknown> | null) => {
        if (cancelled || !meta) return
        const raw =
          (meta.image as string) ||
          (meta.image_uri as string) ||
          (meta.imageUri as string) ||
          null
        if (raw) setResolvedFromMeta(normalizeIpfsUrl(raw))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [uri, mint])

  const label = (symbol ?? mint.slice(0, 2)).toUpperCase()

  if (failed || index >= candidates.length) {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-gradient-to-br from-violet-600/30 via-slate-800/80 to-cyan-600/20 font-bold tracking-tight text-white shadow-inner',
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
      decoding="async"
      referrerPolicy="no-referrer"
      className={cn(
        'shrink-0 rounded-lg border border-white/[0.08] object-cover bg-slate-900/80 shadow-sm',
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
