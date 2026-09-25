// Parses a Xero "Aged Payables Detail" export (.xlsx) into the shape finance-aged-payables.mts
// stores. Deliberately reads raw Excel date serials rather than using the xlsx library's
// `cellDates: true` option — that option constructs JS Date objects using the LOCAL timezone of
// wherever the code runs, which would shift the calendar date by a day for some users; converting
// the serial number directly (Excel's day-count epoch) is timezone-independent.
import * as XLSX from 'xlsx'

export interface ParsedAgedPayablesLine {
  sortOrder: number
  vendorName: string
  invoiceDate: string | null
  dueDate: string | null
  invoiceReference: string | null
  bucket0: number
  bucket1: number
  bucket2: number
  bucket3: number
  bucketOlder: number
  total: number
}

export interface ParsedAgedPayables {
  asAtDate: string
  bucketLabels: string[]
  grandTotal: number
  lines: ParsedAgedPayablesLine[]
}

const MONTH_NAMES: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
}

function excelSerialToIso(serial: number): string {
  const utcMs = Math.round((serial - 25569) * 86400 * 1000)
  return new Date(utcMs).toISOString().slice(0, 10)
}

function cellToIsoDateOrNull(value: unknown): string | null {
  if (typeof value === 'number' && value > 0) return excelSerialToIso(value)
  return null
}

function cellToNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value) || 0
}

/** "As at 30 September 2026" -> "2026-09-30". Built manually rather than via Date.parse — that
 * format ("Day Month Year", no comma) isn't reliably parsed the same way across JS engines. */
function parseAsAtDate(text: string): string | null {
  const match = text.match(/As at (\d{1,2}) ([A-Za-z]+) (\d{4})/)
  if (!match) return null
  const [, day, monthName, year] = match
  const month = MONTH_NAMES[monthName.toLowerCase()]
  if (month === undefined) return null
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`
}

/** Strips a leading "1. " / "12. " numbering prefix some vendor group rows have — Xero applies it
 * inconsistently (compare the file's own "1. Dulux Australia" vs plain "Bamboo Works"), so the
 * stored vendor name is normalized without it either way. */
function cleanVendorName(raw: string): string {
  return raw.replace(/^\d+\.\s*/, '').trim()
}

export async function parseAgedPayablesFile(file: File): Promise<ParsedAgedPayables> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]

  const asAtRow = rows.find((r) => typeof r[0] === 'string' && r[0].startsWith('As at '))
  const asAtDate = asAtRow ? parseAsAtDate(asAtRow[0] as string) : null
  if (!asAtDate) throw new Error('Could not find an "As at <date>" line in this file — is it a Xero Aged Payables Detail export?')

  const headerIndex = rows.findIndex((r) => r[0] === 'Invoice Date')
  if (headerIndex === -1) throw new Error('Could not find the "Invoice Date" header row — is this a Xero Aged Payables Detail export?')
  const headerRow = rows[headerIndex]
  const bucketLabels = headerRow.slice(3, 8).map(String)

  const lines: ParsedAgedPayablesLine[] = []
  let currentVendor = ''
  let grandTotal = 0
  let sortOrder = 0

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    const first = row[0]
    if (first === '' || first == null) continue // blank separator row

    if (first === 'Total') {
      // The grand total row — literally "Total" with nothing after it, unlike a vendor subtotal
      // row ("Total <vendor name>"). Everything meaningful in the file ends here.
      grandTotal = cellToNumber(row[8])
      break
    }

    if (typeof first === 'string' && first.startsWith('Total ')) continue // vendor subtotal row — recomputed on display/export instead of stored

    if (typeof first === 'string') {
      // A new vendor group header row.
      currentVendor = cleanVendorName(first)
      continue
    }

    // An invoice line under the current vendor.
    lines.push({
      sortOrder: sortOrder++,
      vendorName: currentVendor,
      invoiceDate: cellToIsoDateOrNull(first),
      dueDate: cellToIsoDateOrNull(row[1]),
      invoiceReference: row[2] ? String(row[2]) : null,
      bucket0: cellToNumber(row[3]),
      bucket1: cellToNumber(row[4]),
      bucket2: cellToNumber(row[5]),
      bucket3: cellToNumber(row[6]),
      bucketOlder: cellToNumber(row[7]),
      total: cellToNumber(row[8]),
    })
  }

  if (lines.length === 0) throw new Error('No invoice line items found in this file.')

  return { asAtDate, bucketLabels, grandTotal, lines }
}

/** Regenerates a workbook shaped like the original Xero export (title rows, vendor groups with
 * subtotals, grand total, percentage row) from stored report + lines — vendor subtotals are
 * recomputed here rather than stored, since they're fully derivable from the line items. */
export function buildAgedPayablesWorkbook(
  asAtDate: string,
  bucketLabels: string[],
  lines: ParsedAgedPayablesLine[],
): XLSX.WorkBook {
  const rows: (string | number)[][] = []
  const asAtLabel = new Date(`${asAtDate}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

  rows.push(['Aged Payables Detail'])
  rows.push(['QPaint Pty Ltd'])
  rows.push([`As at ${asAtLabel}`])
  rows.push(['Ageing by invoice date'])
  rows.push([])
  rows.push(['Invoice Date', 'Due Date', 'Invoice Reference', ...bucketLabels, 'Total'])
  rows.push([])

  const byVendor = new Map<string, ParsedAgedPayablesLine[]>()
  for (const line of [...lines].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const list = byVendor.get(line.vendorName) ?? []
    list.push(line)
    byVendor.set(line.vendorName, list)
  }

  const grand = [0, 0, 0, 0, 0, 0]
  for (const [vendorName, vendorLines] of byVendor) {
    rows.push([vendorName])
    const subtotal = [0, 0, 0, 0, 0, 0]
    for (const line of vendorLines) {
      rows.push([line.invoiceDate ?? '', line.dueDate ?? '', line.invoiceReference ?? '', line.bucket0, line.bucket1, line.bucket2, line.bucket3, line.bucketOlder, line.total])
      subtotal[0] += line.bucket0
      subtotal[1] += line.bucket1
      subtotal[2] += line.bucket2
      subtotal[3] += line.bucket3
      subtotal[4] += line.bucketOlder
      subtotal[5] += line.total
    }
    rows.push([`Total ${vendorName}`, '', '', ...subtotal])
    rows.push([])
    grand.forEach((_, i) => (grand[i] += subtotal[i]))
  }

  rows.push(['Total', '', '', ...grand])
  rows.push([])
  rows.push(['Percentage of total', '', '', ...grand.map((v) => (grand[5] > 0 ? v / grand[5] : 0))])

  const sheet = XLSX.utils.aoa_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Aged Payables Detail')
  return workbook
}
