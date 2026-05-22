/** Entry gates (probabilistic edge model). */
export const ENTRY_EV_MIN = 0.72
export const ENTRY_RRM_MAX = 0.6
export const ENTRY_SIS_MAX = 0.5
export const ENTRY_LSI_MIN = 0.55
export const ENTRY_MQI_MIN = 0.6

/** Relaxed gates for bonding-curve snipes (autotrader / early curve). */
export const SNIPE_ENTRY_EV_MIN = 0.58
export const SNIPE_ENTRY_MQI_MIN = 0.42
export const SNIPE_ENTRY_LSI_MIN = 0.38
export const SNIPE_FILTER_MQI_MIN = 0.35
export const SNIPE_FILTER_HDI_MIN = 0.28

/** Trade quality hard filters */
export const FILTER_MQI_MIN = 0.5
export const FILTER_HDI_MIN = 0.4

/** Exit */
export const EXIT_SCORE_THRESHOLD = 0.65
export const EXIT_EV_DETERIORATION = 0.25

/** Liquidity */
export const THIN_LIQUIDITY_SOL = 8
export const LIQUIDITY_SPIKE_RATIO = 2.5

/** Position sizing (Kelly-inspired) */
export const BASE_POSITION_SOL = 0.1
export const MIN_POSITION_PCT = 0.005
export const MAX_POSITION_PCT = 0.05
export const ASSUMED_PORTFOLIO_SOL = 10

/** Smart money */
export const SMART_MONEY_ROI_THRESHOLD = 1.5
export const SMART_MONEY_MIN_TRADES = 5

/** Sniper detection */
export const SNIPER_WINDOW_MS = 120_000
export const SAME_BLOCK_DENSITY_THRESHOLD = 4
