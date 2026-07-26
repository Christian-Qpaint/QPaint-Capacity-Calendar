import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Database, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { groupIntoImportBatches } from '@/lib/marketingDataAccess'
import type { MarketingDeal } from '@/types'

export function DataManagementDialog({
  deals,
  onDeleteBatches,
  onClearAll,
}: {
  deals: MarketingDeal[]
  onDeleteBatches: (importBatchIds: string[]) => Promise<void>
  onClearAll: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  const batches = useMemo(() => groupIntoImportBatches(deals), [deals])
  const allSelected = batches.length > 0 && selected.length === batches.length

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }
  function toggleAll() {
    setSelected(allSelected ? [] : batches.map((b) => b.importBatchId))
  }

  async function handleDeleteSelected() {
    setDeleting(true)
    try {
      await onDeleteBatches(selected)
      toast.success(`Deleted ${selected.length} import batch${selected.length === 1 ? '' : 'es'}`)
      setSelected([])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  async function handleClearAll() {
    setDeleting(true)
    try {
      await onClearAll()
      toast.success('Cleared all deals')
      setSelected([])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to clear data')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Database className="size-4" />
        Data
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Data Management</DialogTitle>
          <DialogDescription>
            Every import or sync is grouped into a batch here — select one or more to remove, or clear everything to
            re-sync fresh from Pipedrive.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all batches" />
                </TableHead>
                <TableHead>Imported</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Quoted</TableHead>
                <TableHead className="text-right">Won</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No import history yet.
                  </TableCell>
                </TableRow>
              )}
              {batches.map((batch) => (
                <TableRow key={batch.importBatchId}>
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(batch.importBatchId)}
                      onCheckedChange={() => toggle(batch.importBatchId)}
                      aria-label={`Select batch imported ${batch.importedAt}`}
                    />
                  </TableCell>
                  <TableCell>{new Date(batch.importedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</TableCell>
                  <TableCell className="text-muted-foreground">{batch.source ?? 'Unknown'}</TableCell>
                  <TableCell className="text-right">{batch.count}</TableCell>
                  <TableCell className="text-right">{batch.quotes}</TableCell>
                  <TableCell className="text-right">{batch.won}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{deals.length} deals total across {batches.length} batch{batches.length === 1 ? '' : 'es'}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={selected.length === 0 || deleting}
            onClick={() => setConfirmDeleteOpen(true)}
          >
            <Trash2 className="size-4" /> Delete Selected ({selected.length})
          </Button>
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-xs font-medium text-danger">Danger Zone</p>
          <div className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger-bg/40 p-3">
            <div>
              <p className="text-sm font-medium">Clear all deals</p>
              <p className="text-xs text-muted-foreground">Removes every deal ({deals.length}) so you can re-sync fresh from Pipedrive.</p>
            </div>
            <Button variant="destructive" size="sm" disabled={deals.length === 0 || deleting} onClick={() => setConfirmClearOpen(true)}>
              Clear All
            </Button>
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Delete ${selected.length} import batch${selected.length === 1 ? '' : 'es'}?`}
        description="This permanently removes every deal in the selected batches. This can't be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteSelected}
      />
      <ConfirmDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="Clear all deals?"
        description={`This permanently removes all ${deals.length} deals from Marketing. Ad Spend entries are not affected. This can't be undone.`}
        confirmLabel="Clear All"
        onConfirm={handleClearAll}
      />
    </Dialog>
  )
}
