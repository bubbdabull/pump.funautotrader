/** API/WS payloads are sometimes objects on error — never call .reduce/.map on them blindly. */
export function ensureArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    const nested = (value as { data?: unknown }).data
    if (Array.isArray(nested)) return nested as T[]
  }
  return []
}
