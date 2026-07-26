import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

export interface ImportJob {
  id: string
  label: string
  completed: number
  total: number
  status: 'running' | 'done' | 'error'
  error?: string
  imported?: number
}

interface ImportProgressContextValue {
  job: ImportJob | null
  /** Kicks off `task` in the background and returns immediately — `task` must call onProgress with
   * a running completed-count as it works through chunks. Mounted above the router outlet so the
   * job (and the header's progress pill) survives the user navigating to another page or closing
   * whatever dialog started it. Returns false without starting anything if a job is already
   * running, since two imports racing against the same table isn't safe. */
  runImport: (
    label: string,
    total: number,
    task: (onProgress: (completed: number) => void) => Promise<{ imported: number }>,
  ) => boolean
  dismiss: () => void
}

const ImportProgressContext = createContext<ImportProgressContextValue | null>(null)

export function ImportProgressProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<ImportJob | null>(null)
  const runningRef = useRef(false)

  const runImport = useCallback(
    (label: string, total: number, task: (onProgress: (completed: number) => void) => Promise<{ imported: number }>) => {
      if (runningRef.current) return false
      runningRef.current = true
      const id = crypto.randomUUID()
      setJob({ id, label, completed: 0, total, status: 'running' })

      task((completed) => setJob((prev) => (prev?.id === id ? { ...prev, completed } : prev)))
        .then(({ imported }) => {
          setJob((prev) => (prev?.id === id ? { ...prev, completed: total, status: 'done', imported } : prev))
        })
        .catch((err) => {
          setJob((prev) => (prev?.id === id ? { ...prev, status: 'error', error: err instanceof Error ? err.message : 'Import failed' } : prev))
        })
        .finally(() => {
          runningRef.current = false
        })

      return true
    },
    [],
  )

  const dismiss = useCallback(() => setJob(null), [])

  return <ImportProgressContext.Provider value={{ job, runImport, dismiss }}>{children}</ImportProgressContext.Provider>
}

export function useImportProgress() {
  const ctx = useContext(ImportProgressContext)
  if (!ctx) throw new Error('useImportProgress must be used within an ImportProgressProvider')
  return ctx
}
