import { AlertCircle, CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useImportProgress } from '@/context/ImportProgressContext'

/** Lives in the app header (mounted above the router outlet via ImportProgressProvider) so a
 * background import stays visible — and keeps running — no matter which page the user is on. */
export function ImportProgressIndicator() {
  const { job, dismiss } = useImportProgress()
  if (!job) return null

  const percent = job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0

  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs">
      {job.status === 'running' && (
        <>
          <span className="font-medium whitespace-nowrap">{job.label}</span>
          <Progress value={percent} className="w-24" />
          <span className="tabular-nums text-muted-foreground whitespace-nowrap">
            {percent}% · {job.completed.toLocaleString()}/{job.total.toLocaleString()}
          </span>
        </>
      )}
      {job.status === 'done' && (
        <>
          <CheckCircle2 className="size-3.5 shrink-0 text-success" />
          <span className="whitespace-nowrap">
            {job.label} — {(job.imported ?? job.total).toLocaleString()} imported
          </span>
        </>
      )}
      {job.status === 'error' && (
        <>
          <AlertCircle className="size-3.5 shrink-0 text-danger" />
          <span className="whitespace-nowrap text-danger">{job.label} failed: {job.error}</span>
        </>
      )}
      {job.status !== 'running' && (
        <Button variant="ghost" size="icon-sm" className="size-5" onClick={dismiss} aria-label="Dismiss">
          <X className="size-3" />
        </Button>
      )}
    </div>
  )
}
