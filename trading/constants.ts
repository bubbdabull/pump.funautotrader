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

/** Broad pump.fun REST scan — paginated multi-sort market sweep. */
export const PUMP_FUN_SCAN_TARGET = 4000
export const PUMP_FUN_SCAN_PAGE_SIZE = 100
/** Pages per sort axis (100 × 40 = 4000 rows per sort before dedupe). */
export const PUMP_FUN_SCAN_PAGES_PER_SORT = 40
export const PUMP_FUN_SCAN_INTERVAL_MS = 30_000
export const PUMP_NEAR_GRAD_LIMIT = 80
export const PUMP_FEATURED_FETCH_LIMIT = 200

/** In-memory discovery pool (autotrade candidate ranking). */
export const DISCOVERY_POOL_MAX = 8000

/** Live PumpPortal + RAM feed (UI lanes). */
export const LIVE_FEED_MAX = 800

/** PumpPortal trade stream pins for top discovery + feed mints. */
export const FEED_TRADE_PIN_MAX = 450
export const AUTOTRADE_PRIORITY_MINTS = 250
export const AUTOTRADE_PRIME_LIMIT = 200
export const META_ENRICH_BATCH_SIZE = 100
export const META_ENRICH_WAVES = 3
export const MAP_COIN_BATCH_SIZE = 50

/** Min gap between chart WS pushes per mint (trade ticks are not throttled). */
export const CHART_STREAM_EMIT_MS = 500
/** Min gap between Helius holder refreshes triggered by live trades. */
export const HOLDER_ON_TRADE_REFRESH_MS = 120_000
