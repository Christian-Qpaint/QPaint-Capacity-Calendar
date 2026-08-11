import { Skeleton } from '@/components/ui/skeleton'

/** Generic full-page shimmer shown while the app-wide data bootstrap (DataContext) is still
 * loading — this gate sits above every route (see RouteGuards.tsx), so it can't know which page
 * is about to render. A plain "Loading data…" line used to sit here instead, which reads as
 * "something's broken" far more than a shimmering page shape does, especially on the very first
 * load of a data-heavy page like Production/Capacity. */
export function PageLoadingSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
