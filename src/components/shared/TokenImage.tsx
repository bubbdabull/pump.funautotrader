import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  isLikelyMetadataUri,
  isUsableTokenImageUrl,
  normalizeIpfsUrl,
  resolveTokenImageCandidates,
  parseTokenMetadataJson,
} from '@trading'

interface TokenImageProps {
  mint: string
  symbol?: string
  uri?: string
  image?: string
  className?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

const sizePx = {
  xs: 28,
  sm: 36,
  md: 48,
  lg: 64,
  xl: 80,
} as const

const IPFS_GATEWAYS = ['https://ipfs.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/']

async function fetchMetadataImage(uri: string): Promise<string | null> {
  const normalized = normalizeIpfsUrl(uri)
  const urls = [normalized]
  if (uri.startsWith('ipfs://')) {
    const cid = uri.slice(7)
    for (const g of IPFS_GATEWAYS) urls.push(`${g}${cid}`)
  }

  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const meta = (await res.json()) as Record<string, unknown>
      const parsed = parseTokenMetadataJson(meta)
      if (parsed.image && isUsableTokenImageUrl(parsed.image)) {
        return normalizeIpfsUrl(parsed.image)
      }
    } catch {
      /* next */
    }
  }
  return null
}

export function TokenImage({ mint, symbol, uri, image, className, size = 'md' }: TokenImageProps) {
  const [resolvedFromMeta, setResolvedFromMeta] = useState<string | null>(null)
  const px = sizePx[size]

  const effectiveUri = useMemo(() => {
    if (uri && isLikelyMetadataUri(uri)) return uri
    if (image && isLikelyMetadataUri(image)) return image
    return uri
  }, [uri, image])

  const candidates = useMemo(() => {
    const ordered: string[] = []
    const add = (u?: string | null) => {
      if (!u || !isUsableTokenImageUrl(u)) return
      const n = normalizeIpfsUrl(u)
      if (!ordered.includes(n)) ordered.push(n)
    }
    add(image)
    add(resolvedFromMeta)
    for (const u of resolveTokenImageCandidates(mint, { uri: effectiveUri, image })) {
      add(u)
    }
    return ordered
  }, [mint, effectiveUri, image, resolvedFromMeta])

  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setIndex(0)
    setFailed(false)
    setLoaded(false)
    setResolvedFromMeta(null)
  }, [mint, uri, image])

  useEffect(() => {
    if (!effectiveUri || !isLikelyMetadataUri(effectiveUri)) return
    let cancelled = false
    void fetchMetadataImage(effectiveUri).then((img) => {
      if (!cancelled && img) setResolvedFromMeta(img)
    })
    return () => {
      cancelled = true
    }
  }, [effectiveUri, mint])

  const label = (symbol ?? mint.slice(0, 2)).toUpperCase().slice(0, 2)
  const showFallback = failed || index >= candidates.length
  const src = candidates[index]

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-slate-900/90',
        className,
      )}
      style={{ width: px, height: px, minWidth: px, minHeight: px }}
      aria-label={symbol ?? mint}
    >
      {showFallback ? (
        <div className="flex h-full w-full items-center justify-center bg-slate-800/90">
          <span
            className="font-bold tracking-tight text-zinc-500"
            style={{ fontSize: Math.max(10, px * 0.32) }}
          >
            {label}
          </span>
        </div>
      ) : (
        <>
          {!loaded && (
            <div className="absolute inset-0 animate-pulse bg-slate-800/80" />
          )}
          <img
            key={`${mint}-${index}-${src.slice(0, 48)}`}
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className={cn(
              'absolute inset-0 h-full w-full object-cover object-center',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
            onLoad={() => setLoaded(true)}
            onError={() => {
              if (index + 1 < candidates.length) {
                setIndex((i) => i + 1)
                setLoaded(false)
              } else {
                setFailed(true)
              }
            }}
          />
        </>
      )}
    </div>
  )
}
