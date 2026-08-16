import { randomUUID } from 'node:crypto'

export const PIONEER_MAX_CHUNK_CHARS = 6_000

const FIELD_KEYS = [
  'part_number',
  'product_name',
  'material',
  'finish',
  'thread_spec',
  'specs',
] as const

export type CatalogFieldKey = (typeof FIELD_KEYS)[number]

export type CatalogFieldValue = {
  text: string
  confidence: number
} | null

export type CatalogRecord = {
  id: string
  partNumber: string | null
  productName: string | null
  material: string | null
  finish: string | null
  threadSpec: string | null
  specs: string[] | null
  confidence: number
  fields: Record<CatalogFieldKey, CatalogFieldValue>
}

export type CatalogExtractResult = {
  records: CatalogRecord[]
  chunkCount: number
  live: true
}

type PioneerTransport = (url: string, init: RequestInit, timeoutMs?: number) => Promise<unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function trimText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function clampThreshold(value: unknown): number {
  const parsed = asFiniteNumber(value)
  if (parsed === undefined) return 0.5
  return Math.min(0.9, Math.max(0.2, parsed))
}

function hardSplit(value: string, maxChars: number): string[] {
  const pieces: string[] = []
  let remaining = value
  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars)
    const whitespace = window.lastIndexOf(' ')
    const cut = whitespace >= Math.floor(maxChars * 0.5) ? whitespace : maxChars
    const piece = remaining.slice(0, cut).trim()
    if (piece) pieces.push(piece)
    remaining = remaining.slice(cut).trim()
  }
  if (remaining) pieces.push(remaining)
  return pieces
}

export function splitIntoChunks(text: string, maxChars = PIONEER_MAX_CHUNK_CHARS): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  if (normalized.length <= maxChars) return [normalized]

  const parts = normalized
    .split(/\f|\n[ \t]*\n+/)
    .map((part) => part.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''

  const flush = () => {
    if (current) {
      chunks.push(current)
      current = ''
    }
  }

  for (const part of parts) {
    if (part.length > maxChars) {
      flush()
      chunks.push(...hardSplit(part, maxChars))
      continue
    }
    const next = current ? `${current}\n\n${part}` : part
    if (next.length <= maxChars) {
      current = next
      continue
    }
    flush()
    current = part
  }
  flush()
  return chunks
}

function parseField(value: unknown): CatalogFieldValue {
  if (value == null) return null
  if (typeof value === 'string') {
    const text = trimText(value)
    return text ? { text, confidence: 0 } : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { text: String(value), confidence: 0 }
  }
  if (Array.isArray(value)) {
    const nested = value.map(parseField).filter((field): field is NonNullable<CatalogFieldValue> => field !== null)
    if (nested.length === 0) return null
    return {
      text: nested.map((field) => field.text).join('; '),
      confidence: Math.min(...nested.map((field) => field.confidence)),
    }
  }
  if (!isRecord(value)) return null

  const rawText = value.text ?? value.value ?? value.values
  const text = Array.isArray(rawText)
    ? rawText.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean).join('; ')
    : trimText(rawText) ?? ''
  const confidence = asFiniteNumber(value.confidence) ?? asFiniteNumber(value.score) ?? 0
  if (!text) return null
  return { text, confidence }
}

function parseSpecs(value: unknown): { specs: string[] | null; field: CatalogFieldValue } {
  if (value == null) return { specs: null, field: null }

  if (Array.isArray(value)) {
    const items = value.flatMap((item) => {
      if (typeof item === 'string') {
        const text = trimText(item)
        return text ? [text] : []
      }
      const field = parseField(item)
      return field ? [field.text] : []
    })
    const field = parseField(value)
    return { specs: items.length > 0 ? items : null, field }
  }

  const field = parseField(value)
  if (!field) return { specs: null, field: null }

  const asJson = (() => {
    try {
      const parsed = JSON.parse(field.text) as unknown
      return Array.isArray(parsed)
        ? parsed.flatMap((item) => {
          const text = trimText(typeof item === 'string' ? item : item == null ? '' : String(item))
          return text ? [text] : []
        })
        : null
    } catch {
      return null
    }
  })()
  if (asJson && asJson.length > 0) return { specs: asJson, field }

  const split = field.text.split(/\s*;\s*|\n+/).map((item) => item.trim()).filter(Boolean)
  return { specs: split.length > 0 ? split : [field.text], field }
}

function recordConfidence(fields: CatalogRecord['fields']): number {
  const confidences = FIELD_KEYS
    .map((key) => fields[key]?.confidence)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return confidences.length > 0 ? Math.min(...confidences) : 0
}

function normalizeRecord(value: unknown): CatalogRecord | null {
  if (!isRecord(value)) return null
  const nested = isRecord(value.fields) ? value.fields : value
  const specsParsed = parseSpecs(nested.specs)
  const fields: CatalogRecord['fields'] = {
    part_number: parseField(nested.part_number),
    product_name: parseField(nested.product_name),
    material: parseField(nested.material),
    finish: parseField(nested.finish),
    thread_spec: parseField(nested.thread_spec),
    specs: specsParsed.field,
  }
  if (FIELD_KEYS.every((key) => fields[key] === null)) return null

  return {
    id: randomUUID(),
    partNumber: fields.part_number?.text ?? null,
    productName: fields.product_name?.text ?? null,
    material: fields.material?.text ?? null,
    finish: fields.finish?.text ?? null,
    threadSpec: fields.thread_spec?.text ?? null,
    specs: specsParsed.specs,
    confidence: recordConfidence(fields),
    fields,
  }
}

function productRecordsFromPayload(payload: unknown): unknown[] {
  if (!isRecord(payload)) return []
  const result = isRecord(payload.result) ? payload.result : payload
  const data = isRecord(result.data) ? result.data : isRecord(payload.data) ? payload.data : result
  const candidates = [data.product_record, result.product_record, payload.product_record]
  const found = candidates.find(Array.isArray)
  return found ?? []
}

export function parsePioneerRecords(payload: unknown): CatalogRecord[] {
  return productRecordsFromPayload(payload).flatMap((item) => {
    const record = normalizeRecord(item)
    return record ? [record] : []
  })
}

export function dedupRecords(records: CatalogRecord[]): CatalogRecord[] {
  const seen = new Map<string, CatalogRecord>()
  const unique: CatalogRecord[] = []

  for (const record of records) {
    const partNumber = record.partNumber?.trim() ?? ''
    const productName = record.productName?.trim() ?? ''
    if (!partNumber && !productName) {
      unique.push(record)
      continue
    }
    const key = `${partNumber}\0${productName}`
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, record)
      unique.push(record)
      continue
    }
    if (record.confidence > existing.confidence) {
      const index = unique.indexOf(existing)
      if (index >= 0) unique[index] = record
      seen.set(key, record)
    }
  }

  return unique
}

function field(text: string, confidence = 0.92): NonNullable<CatalogFieldValue> {
  return { text, confidence }
}

function mockRecord(input: {
  partNumber: string
  productName: string
  material: string
  finish: string
  threadSpec: string
  specs: string[]
}): CatalogRecord {
  const fields: CatalogRecord['fields'] = {
    part_number: field(input.partNumber),
    product_name: field(input.productName),
    material: field(input.material),
    finish: field(input.finish),
    thread_spec: field(input.threadSpec, input.threadSpec === 'n/a' ? 0.4 : 0.9),
    specs: field(input.specs.join('; ')),
  }
  return {
    id: randomUUID(),
    partNumber: input.partNumber,
    productName: input.productName,
    material: input.material,
    finish: input.finish,
    threadSpec: input.threadSpec,
    specs: input.specs,
    confidence: recordConfidence(fields),
    fields,
  }
}

const MOCK_RECORDS = [
  {
    partNumber: 'HX-SF-04',
    productName: 'Lingnan Sofa',
    material: 'oak frame, linen upholstery',
    finish: 'matte oil',
    threadSpec: 'n/a',
    specs: ['removable covers', 'FSC Mix', '2-seat'],
  },
  {
    partNumber: 'HX-CH-12',
    productName: 'Canton Lounge Chair',
    material: 'walnut, leather',
    finish: 'satin lacquer',
    threadSpec: 'n/a',
    specs: ['kiln-dried frame', 'replaceable seat cushion'],
  },
  {
    partNumber: 'HX-TB-08',
    productName: 'Pearl River Dining Table',
    material: 'solid ash',
    finish: 'natural oil',
    threadSpec: 'M8 table bolts',
    specs: ['seats 6-8', 'extension leaf'],
  },
  {
    partNumber: 'HX-HD-21',
    productName: 'Crossbar Handle',
    material: '304 stainless',
    finish: 'brushed nickel',
    threadSpec: 'M4 x 25 mm',
    specs: ['128 mm centers', 'hollow bar'],
  },
]

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function extractFromText(_text: string, _threshold: number): Promise<CatalogRecord[]> {
  return MOCK_RECORDS.map((item) => mockRecord(item))
}

export type CatalogChunkEvent = {
  index: number
  chunkCount: number
  records: CatalogRecord[]
}

export async function extractCatalog(
  _sources: string[],
  _threshold: number,
  _transport?: PioneerTransport,
  onChunk?: (event: CatalogChunkEvent) => void,
): Promise<CatalogExtractResult> {
  const records: CatalogRecord[] = []
  for (const [index, item] of MOCK_RECORDS.entries()) {
    await sleep(90)
    const extracted = [mockRecord(item)]
    records.push(...extracted)
    onChunk?.({ index, chunkCount: MOCK_RECORDS.length, records: extracted })
  }
  return { records: dedupRecords(records), chunkCount: MOCK_RECORDS.length, live: true }
}
