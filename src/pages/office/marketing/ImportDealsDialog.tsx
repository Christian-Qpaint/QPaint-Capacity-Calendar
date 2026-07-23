import { useMemo, useState } from 'react'
import { Upload } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  buildDealsFromImport,
  guessColumnMapping,
  guessStageClassification,
  isDateDetectionMode,
  parseImportFile,
  uniqueColumnValues,
  EMPTY_COLUMN_MAPPING,
  type ColumnMapping,
  type ParsedImportFile,
  type StageClassification,
} from '@/lib/marketingImport'
import { formatCurrency } from '@/lib/formulas'
import type { MarketingDeal } from '@/types'

type Step = 'upload' | 'map' | 'classify' | 'preview'

const MAPPING_FIELDS: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
  { key: 'referralSource', label: 'Referral Source', required: true },
  { key: 'value', label: 'Deal Value', required: true },
  { key: 'createdDate', label: 'Created Date', required: true },
  { key: 'title', label: 'Title' },
  { key: 'salesperson', label: 'Salesperson' },
  { key: 'rawStage', label: 'Stage / Status (for the Stage filter)' },
  { key: 'quotedDate', label: 'Quote Sent Date (marks a deal as Quoted)' },
  { key: 'wonDate', label: 'Won Date (marks a deal as Won)' },
  { key: 'externalId', label: 'Deal ID' },
]

export function ImportDealsDialog({
  onImport,
}: {
  onImport: (deals: Omit<MarketingDeal, 'id' | 'importedAt'>[]) => Promise<{ imported: number }>
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedImportFile | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_COLUMN_MAPPING)
  const [classification, setClassification] = useState<StageClassification>({})
  const [importing, setImporting] = useState(false)

  const stages = useMemo(() => uniqueColumnValues(parsed?.rows ?? [], mapping.rawStage), [parsed, mapping.rawStage])
  const dateMode = isDateDetectionMode(mapping)
  const needsClassifyStep = !dateMode && !!mapping.rawStage

  const built = useMemo(() => {
    if (!parsed) return null
    return buildDealsFromImport(parsed.rows, mapping, classification, 'preview')
  }, [parsed, mapping, classification])

  function reset() {
    setStep('upload')
    setFileName('')
    setParsing(false)
    setParseError(null)
    setParsed(null)
    setMapping(EMPTY_COLUMN_MAPPING)
    setClassification({})
    setImporting(false)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setParsing(true)
    setParseError(null)
    try {
      const result = await parseImportFile(file)
      if (result.rows.length === 0) {
        setParseError('No data rows found in that file.')
        setParsing(false)
        return
      }
      setParsed(result)
      setMapping(guessColumnMapping(result.headers))
      setStep('map')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not read that file.')
    } finally {
      setParsing(false)
    }
  }

  const canProceedFromMap = MAPPING_FIELDS.filter((f) => f.required).every((f) => mapping[f.key])

  function handleMapNext() {
    if (needsClassifyStep) {
      setClassification(guessStageClassification(stages))
      setStep('classify')
    } else {
      setStep('preview')
    }
  }

  async function handleImport() {
    if (!built || built.deals.length === 0) return
    setImporting(true)
    try {
      const batchId = crypto.randomUUID()
      const dealsWithBatch = built.deals.map((d) => ({ ...d, importBatchId: batchId }))
      const { imported } = await onImport(dealsWithBatch)
      setOpen(false)
      reset()
      // eslint-disable-next-line no-console
      console.info(`Imported ${imported} deals`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Upload className="size-4" />
        Import Deals
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Deals</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel export from Pipedrive (Leads, Quotes, and Jobs Won) to feed the Marketing dashboard.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-3">
            <Label htmlFor="import-file">CSV or Excel file</Label>
            <Input id="import-file" type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} disabled={parsing} />
            {parsing && <p className="text-sm text-muted-foreground">Reading {fileName}…</p>}
            {parseError && <p className="text-sm text-danger">{parseError}</p>}
          </div>
        )}

        {step === 'map' && parsed && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Match each field to a column from <span className="font-medium text-foreground">{fileName}</span> ({parsed.rows.length} rows).
            </p>
            <div className="grid grid-cols-2 gap-3">
              {MAPPING_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1">
                  <Label>
                    {field.label}
                    {field.required && <span className="text-danger"> *</span>}
                  </Label>
                  <Select
                    value={mapping[field.key] ?? '__none__'}
                    onValueChange={(v) => setMapping((prev) => ({ ...prev, [field.key]: v === '__none__' ? null : v }))}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— none —</SelectItem>
                      {parsed.headers.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {dateMode && (
              <p className="text-xs text-muted-foreground">
                Quoted/Won will be detected from whether a row has a Quote Sent / Won date — no separate classify step needed.
              </p>
            )}
            {!dateMode && !mapping.rawStage && (
              <p className="text-xs text-warning">
                No Stage/Status column or Quote/Won date column mapped — every row will be imported as a Lead only.
              </p>
            )}
          </div>
        )}

        {step === 'classify' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Mark which stage values count as a Quote or a Job Won — everything else counts only as a Lead.
            </p>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage / Status value</TableHead>
                    <TableHead className="text-center">Counts as Quoted</TableHead>
                    <TableHead className="text-center">Counts as Won</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stages.map((stage) => {
                    const cls = classification[stage] ?? { isQuoted: false, isWon: false }
                    return (
                      <TableRow key={stage}>
                        <TableCell>{stage}</TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={cls.isQuoted}
                            onCheckedChange={(v) =>
                              setClassification((prev) => ({ ...prev, [stage]: { ...cls, isQuoted: !!v } }))
                            }
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={cls.isWon}
                            onCheckedChange={(v) =>
                              setClassification((prev) => ({
                                ...prev,
                                [stage]: { isQuoted: cls.isQuoted || !!v, isWon: !!v },
                              }))
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === 'preview' && built && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{built.deals.length} leads</Badge>
              <Badge variant="secondary">{built.deals.filter((d) => d.isQuoted).length} quoted</Badge>
              <Badge variant="secondary">{built.deals.filter((d) => d.isWon).length} won</Badge>
              {built.skipped > 0 && <Badge variant="destructive">{built.skipped} rows skipped (no valid created date)</Badge>}
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Referral Source</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {built.deals.slice(0, 25).map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="max-w-48 truncate">{d.title ?? '—'}</TableCell>
                      <TableCell>{d.referralSource}</TableCell>
                      <TableCell>{d.rawStage ?? '—'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(d.value)}</TableCell>
                      <TableCell>{d.createdDate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {built.deals.length > 25 && (
                <p className="border-t border-border p-2 text-xs text-muted-foreground">
                  Showing first 25 of {built.deals.length} rows.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="justify-between sm:justify-between">
          <div>
            {step !== 'upload' && (
              <Button
                variant="ghost"
                onClick={() =>
                  setStep(step === 'map' ? 'upload' : step === 'classify' ? 'map' : needsClassifyStep ? 'classify' : 'map')
                }
              >
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            {step === 'map' && (
              <Button onClick={handleMapNext} disabled={!canProceedFromMap}>
                Next
              </Button>
            )}
            {step === 'classify' && <Button onClick={() => setStep('preview')}>Next</Button>}
            {step === 'preview' && (
              <Button onClick={handleImport} disabled={importing || !built || built.deals.length === 0}>
                {importing ? 'Importing…' : `Import ${built?.deals.length ?? 0} deals`}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
