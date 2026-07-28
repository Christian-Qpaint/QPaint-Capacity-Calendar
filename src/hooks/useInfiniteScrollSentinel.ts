import { useEffect, useRef } from 'react'

/** A ref to attach to a sentinel element placed after the last loaded row/card. When it scrolls
 * into view, `onLoadMore` fires — the lazy-load-by-page mechanism for both the Deals table
 * (root = viewport) and each Kanban column (root = that column's own scroll container).
 *
 * Reads `hasMore`/`loading`/`onLoadMore` from a ref updated every render, so callers don't need to
 * memoize them — only `root` actually needs to be stable to avoid tearing down/recreating the
 * observer needlessly. */
export function useInfiniteScrollSentinel({
  onLoadMore,
  hasMore,
  loading,
  root,
}: {
  onLoadMore: () => void
  hasMore: boolean
  loading: boolean
  root?: Element | null
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef({ onLoadMore, hasMore, loading })
  stateRef.current = { onLoadMore, hasMore, loading }

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && stateRef.current.hasMore && !stateRef.current.loading) {
          stateRef.current.onLoadMore()
        }
      },
      { root: root ?? null, rootMargin: '300px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [root])

  return sentinelRef
}
