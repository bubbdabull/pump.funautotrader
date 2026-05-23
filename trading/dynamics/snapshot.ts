import { TimeBucketRing, type SerializedBucket } from './timeBuckets'
import { createMintDynamics } from './engine'
import type { MintDynamicsState } from './engine'
import type { TokenLifecycleState } from './types'

export type { SerializedBucket }
export const DYNAMICS_SNAPSHOT_VERSION = 1

export interface SerializedMintDynamics {
  mint: string
  lifecycle: TokenLifecycleState
  lastTradeAt: number
  bondingCurvePercent: number
  holderEstimate: number
  coordinationPenalty: number
  coordinationFlags: string[]
  buckets: SerializedBucket[]
  cursor: number
}

export function serializeMintDynamics(state: MintDynamicsState): SerializedMintDynamics {
  return {
    mint: state.mint,
    lifecycle: state.lifecycle,
    lastTradeAt: state.lastTradeAt,
    bondingCurvePercent: state.bondingCurvePercent,
    holderEstimate: state.holderEstimate,
    coordinationPenalty: state.coordinationPenalty,
    coordinationFlags: state.coordinationFlags,
    buckets: state.ring.exportBuckets(),
    cursor: state.ring.getCursor(),
  }
}

export function restoreMintDynamics(data: SerializedMintDynamics): MintDynamicsState {
  const state = createMintDynamics(data.mint)
  state.lifecycle = data.lifecycle
  state.lastTradeAt = data.lastTradeAt
  state.bondingCurvePercent = data.bondingCurvePercent
  state.holderEstimate = data.holderEstimate
  state.coordinationPenalty = data.coordinationPenalty
  state.coordinationFlags = data.coordinationFlags ?? []
  state.ring = TimeBucketRing.fromSerialized(data.buckets, data.cursor)
  return state
}
