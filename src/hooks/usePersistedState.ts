import { useEffect, useState } from 'react'

/** Like useState, but the value is persisted to localStorage under `key` and rehydrated on
 * mount — so view modes, filters, search text, and pagination survive navigating to another
 * page and back, and a full page refresh, instead of resetting every time.
 *
 * Pass `serialize`/`deserialize` for values JSON can't round-trip on its own (e.g. Date). */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  options?: { serialize?: (value: T) => string; deserialize?: (raw: string) => T },
) {
  const serialize = options?.serialize ?? ((v: T) => JSON.stringify(v))
  const deserialize = options?.deserialize ?? ((raw: string) => JSON.parse(raw) as T)

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw != null ? deserialize(raw) : defaultValue
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, serialize(value))
    } catch {
      // Persistence is a nice-to-have — a full localStorage quota or a serialization edge case
      // shouldn't ever break the page itself.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value])

  return [value, setValue] as const
}
