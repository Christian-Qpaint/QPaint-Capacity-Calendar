// Marketing module — CSV/Excel import parsing + row-mapping helpers. Kept as pure functions
// (parsing, column mapping, stage classification, row-building) separate from the wizard UI
// component so the import logic is independently testable and reusable.

import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { MarketingDeal } from '@/types'

export interface ParsedImportFile {
  headers: string[]
  rows: Record<string, string>[]
}

export async function parseImportFile(file: File): Promise<ParsedImportFile> {
  return /\.xlsx?$/i.test(file.name) ? parseExcelFile(file) : parseCsvFile(file)
}

function parseCsvFile(file: File): Promise<ParsedImportFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve({ headers: result.meta.fields ?? [], rows: result.data }),
      error: (err) => reject(err),
    })
  })
}

async function parseExcelFile(file: File): Promise<ParsedImportFile> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const [headerRow, ...dataRows] = grid
  const headers = (headerRow ?? []).map((h) => String(h ?? '').trim())
  const rows = dataRows
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row) => Object.fromEntries(headers.map((h, i) => [h, String(row[i] ?? '').trim()])))
  return { headers, rows }
}

/** Which import-file column feeds each Marketing Deal field. `null` = not mapped.
 *
 * Quoted/Won can be determined two ways, and the wizard picks whichever the mapping supports:
 *  - Date-presence mode (`quotedDate`/`wonDate` mapped): Pipedrive's "Deals Insights" exports give
 *    one column per pipeline milestone (e.g. "Date - Quote Sent", "Won time") that's populated iff
 *    the deal passed through that milestone — a deal can be quoted *and later lost*, which a
 *    single current-status column can't represent but these per-milestone date columns can.
 *  - Stage-classification mode (`rawStage` mapped, no date columns): a simpler export with one
 *    status/stage column, classified value-by-value in the wizard's classify step (see
 *    StageClassification below).
 */
export interface ColumnMapping {
  title: string | null
  referralSource: string | null
  salesperson: string | null
  rawStage: string | null
  value: string | null
  createdDate: string | null
  quotedDate: string | null
  wonDate: string | null
  externalId: string | null
}

export const EMPTY_COLUMN_MAPPING: ColumnMapping = {
  title: null,
  referralSource: null,
  salesperson: null,
  rawStage: null,
  value: null,
  createdDate: null,
  quotedDate: null,
  wonDate: null,
  externalId: null,
}

export const REQUIRED_MAPPING_FIELDS: (keyof ColumnMapping)[] = ['referralSource', 'value', 'createdDate']

export function isDateDetectionMode(mapping: ColumnMapping): boolean {
  return !!(mapping.quotedDate || mapping.wonDate)
}

/** Best-effort auto-match of import columns to fields, by keyword rather than exact header
 * text — Pipedrive's export header naming varies by report type (e.g. plain "Owner" vs.
 * "Deal - Owner" vs. "Deal - Deal value"), so a substring match is far more resilient than an
 * exact-match whitelist. */
export function guessColumnMapping(headers: string[]): ColumnMapping {
  const find = (...keywords: string[]) =>
    headers.find((h) => {
      const normalized = h.toLowerCase().trim()
      return keywords.some((k) => normalized.includes(k))
    }) ?? null

  return {
    title: find('title'),
    referralSource: find('referral source', 'lead source', 'source'),
    salesperson: find('owner', 'salesperson', 'sales rep'),
    rawStage: find('status', 'stage'),
    value: find('deal value', 'value', 'amount'),
    createdDate: find('created'),
    quotedDate: find('quote sent', 'quoted date', 'date sent'),
    wonDate: find('won time', 'won date', 'date won', 'close date'),
    externalId: find('deal id', 'deal - id'),
  }
}

export function uniqueColumnValues(rows: Record<string, string>[], column: string | null): string[] {
  if (!column) return []
  return Array.from(new Set(rows.map((r) => (r[column] ?? '').trim()).filter(Boolean))).sort()
}

export type StageClassification = Record<string, { isQuoted: boolean; isWon: boolean }>

/** Reasonable defaults so the classify step isn't all-unchecked: stage names containing "quote"
 * default to Quoted, "won"/"complete"/"paid" default to Won. Purely a starting point — the user
 * reviews and can flip any of these before importing. */
export function guessStageClassification(stages: string[]): StageClassification {
  const result: StageClassification = {}
  for (const stage of stages) {
    const s = stage.toLowerCase()
    const isWon = /\b(won|complete|paid)\b/.test(s)
    const isQuoted = isWon || /\bquote/.test(s)
    result[stage] = { isQuoted, isWon }
  }
  return result
}

function parseAmount(raw: string | undefined): number {
  if (!raw) return 0
  const cleaned = raw.replace(/[^0-9.-]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export interface BuildDealsResult {
  deals: Omit<MarketingDeal, 'id' | 'importedAt'>[]
  skipped: number
}

/** Rows without a parseable created-date are dropped (can't place them on any date-scoped
 * chart/filter) — `skipped` reports how many so the wizard can surface it rather than silently
 * importing fewer rows than the file contained. */
export function buildDealsFromImport(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  classification: StageClassification,
  importBatchId: string,
): BuildDealsResult {
  const deals: Omit<MarketingDeal, 'id' | 'importedAt'>[] = []
  let skipped = 0
  const dateMode = isDateDetectionMode(mapping)

  for (const row of rows) {
    const createdDate = parseDate(mapping.createdDate ? row[mapping.createdDate] : undefined)
    if (!createdDate) {
      skipped++
      continue
    }
    const rawStage = mapping.rawStage ? (row[mapping.rawStage] ?? '').trim() : ''

    let isQuoted: boolean
    let isWon: boolean
    let eventDate: string | null

    if (dateMode) {
      const quotedRaw = mapping.quotedDate ? row[mapping.quotedDate] : undefined
      const wonRaw = mapping.wonDate ? row[mapping.wonDate] : undefined
      isWon = !!wonRaw?.trim()
      isQuoted = isWon || !!quotedRaw?.trim()
      eventDate = isWon ? (parseDate(wonRaw) ?? createdDate) : null
    } else {
      const cls = classification[rawStage] ?? { isQuoted: false, isWon: false }
      isQuoted = cls.isQuoted
      isWon = cls.isWon
      eventDate = isWon ? createdDate : null
    }

    deals.push({
      externalId: mapping.externalId ? row[mapping.externalId] || null : null,
      title: mapping.title ? row[mapping.title] || null : null,
      referralSource: (mapping.referralSource ? row[mapping.referralSource] : '').trim() || 'Other',
      salesperson: mapping.salesperson ? row[mapping.salesperson] || null : null,
      rawStage: rawStage || null,
      isQuoted,
      isWon,
      value: mapping.value ? parseAmount(row[mapping.value]) : 0,
      createdDate,
      eventDate,
      importBatchId,
    })
  }

  return { deals, skipped }
}
