import { extractText } from 'unpdf'
import { httpError } from '../../http-errors.js'

function decodePdfBase64(pdfBase64: string): Uint8Array {
  const trimmed = pdfBase64.trim()
  if (!trimmed) throw httpError(400, 'pdfBase64 is empty')

  const comma = trimmed.indexOf(',')
  const payload = trimmed.startsWith('data:') && comma !== -1
    ? trimmed.slice(comma + 1)
    : trimmed

  let bytes: Buffer
  try {
    bytes = Buffer.from(payload, 'base64')
  } catch {
    throw httpError(400, 'pdfBase64 is not valid base64')
  }
  if (bytes.length === 0) throw httpError(400, 'pdfBase64 is not valid base64')
  if (bytes.subarray(0, 4).toString('ascii') !== '%PDF') {
    throw httpError(400, 'pdfBase64 is not a PDF')
  }
  return new Uint8Array(bytes)
}

export async function extractPdfPageTexts(pdfBase64: string): Promise<string[]> {
  const bytes = decodePdfBase64(pdfBase64)
  try {
    const extracted = await extractText(bytes)
    const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text]
    return pages
      .map((page) => (typeof page === 'string' ? page.replace(/\r\n/g, '\n').trim() : ''))
      .filter((page) => page.length > 0)
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'statusCode' in error) throw error
    throw httpError(400, 'Unable to parse PDF')
  }
}
