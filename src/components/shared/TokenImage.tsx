import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { API_BASE } from '@/lib/apiConfig'
import {
  isLikelyMetadataUri,
  normalizeIpfsUrl,
  resolveTokenImageCandidates,
  parseTokenMetadataJson,
  isDirectImageUrl,
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
      if (parsed.image && isDirectImageUrl(parsed.image)) {
        return normalizeIpfsUrl(parsed.image)
      }
    } catch {
      /* try next gateway */
    }
  }
  return null
}

async function fetchPumpFunImageUri(mint: string): Promise<string | null> {
  try {
    const res = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { image_uri?: string; metadata_uri?: string }
    if (data.image_uri && isDirectImageUrl(data.image_uri)) {
      return normalizeIpfsUrl(data.image_uri)
    }
    if (data.metadata_uri) return data.metadata_uri
  } catch {
    /* CORS or network — fall through */
  }
  return null
}

async function fetchTokenMetaFromApi(mint: string): Promise<{ uri?: string; image?: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/tokens/${mint}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { metadataUri?: string; image?: string; uri?: string }
    return {
      uri: data.metadataUri || data.uri,
      image: data.image,
    }
  } catch {
    return null
  }
}

export function TokenImage({ mint, symbol, uri, image, className, size = 'md' }: TokenImageProps) {
  const [resolvedFromMeta, setResolvedFromMeta] = useState<string | null>(null)
  const px = sizePx[size]

  const effectiveUri = useMemo(() => {
    if (uri && isLikelyMetadataUri(uri)) return uri
    if (image && isLikelyMetadataUri(image)) return image
    return uri
  }, [uri, image])

  const directImage = useMemo(() => {
    if (image && isDirectImageUrl(image)) return normalizeIpfsUrl(image)
    if (uri && isDirectImageUrl(uri)) return normalizeIpfsUrl(uri)
    return undefined
  }, [uri, image])

  const candidates = useMemo(() => {
    const base = resolveTokenImageCandidates(mint, {
      uri: effectiveUri,
      image: directImage ?? image,
    })
    const ordered: string[] = []
    if (resolvedFromMeta) ordered.push(resolvedFromMeta)
    if (image?.includes('pump.fun/coin/') && !ordered.includes(image)) {
      ordered.push(image)
    }
    if (directImage && !ordered.includes(directImage)) ordered.push(directImage)
    for (const u of base) {
      if (!isLikelyMetadataUri(u) && !ordered.includes(u)) ordered.push(u)
    }
    return ordered
  }, [mint, effectiveUri, image, directImage, resolvedFromMeta])

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

  useEffect(() => {
    if (effectiveUri || resolvedFromMeta || (image && isDirectImageUrl(image))) return
    let cancelled = false
    void (async () => {
      const fromApi = await fetchTokenMetaFromApi(mint)
      if (cancelled) return
      if (fromApi?.uri && isLikelyMetadataUri(fromApi.uri)) {
        const img = await fetchMetadataImage(fromApi.uri)
        if (!cancelled && img) {
          setResolvedFromMeta(img)
          return
        }
      }
      if (fromApi?.image && isDirectImageUrl(fromApi.image) && !cancelled) {
        setResolvedFromMeta(normalizeIpfsUrl(fromApi.image))
        return
      }
      const pump = await fetchPumpFunImageUri(mint)
      if (!cancelled && pump) {
        if (isDirectImageUrl(pump)) setResolvedFromMeta(pump)
        else {
          const img = await fetchMetadataImage(pump)
          if (!cancelled && img) setResolvedFromMeta(img)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mint, effectiveUri, image, resolvedFromMeta])

  const label = (symbol ?? mint.slice(0, 2)).toUpperCase().slice(0, 2)
  const showFallback = failed || index >= candidates.length

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
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-600/35 via-slate-800 to-cyan-600/25">
          <span
            className="font-bold tracking-tight text-white"
            style={{ fontSize: Math.max(10, px * 0.32) }}
          >
            {label}
          </span>
        </div>
      ) : (
        <>
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80">
              <span
                className="font-bold text-zinc-500"
                style={{ fontSize: Math.max(9, px * 0.28) }}
              >
                {label}
              </span>
            </div>
          )}
          <img
            src={candidates[index]}
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
              } else setFailed(true)
            }}
          />
        </>
      )}
    </div>
  )
}
