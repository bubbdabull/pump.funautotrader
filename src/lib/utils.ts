import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

export function formatHolders(
  value: number | undefined | null,
  verified?: boolean,
): string {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '—'
  let s: string
  if (n >= 1_000_000) s = `${(n / 1_000_000).toFixed(1)}M`
  else if (n >= 10_000) s = `${(n / 1_000).toFixed(1)}K`
  else s = n.toLocaleString()
  if (verified) return `${s}*`
  if (n < 500) return `~${s}`
  return s
}

export function formatSol(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K SOL`
  if (value >= 1) return `${value.toFixed(2)} SOL`
  if (value > 0) return `${value.toFixed(3)} SOL`
  return '0 SOL'
}

/** Volume display: prefer trade volume, fall back to bonding-curve liquidity */
export function tokenVolumeSol(token: { volume24h: number; liquidity?: number }): number {
  if (token.volume24h > 0) return token.volume24h
  return token.liquidity ?? 0
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function shortenAddress(addr: string, chars = 4): string {
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`
}

/** Signal score: lower = better entry for sniper rules */
export function signalColor(score: number): string {
  if (score <= 30) return 'text-emerald-400'
  if (score <= 55) return 'text-amber-400'
  return 'text-red-400'
}

export function signalBg(score: number): string {
  if (score <= 30) return 'bg-emerald-500/20 border-emerald-500/30'
  if (score <= 55) return 'bg-amber-500/20 border-amber-500/30'
  return 'bg-red-500/20 border-red-500/30'
}

export const riskColor = signalColor
export const riskBg = signalBg
