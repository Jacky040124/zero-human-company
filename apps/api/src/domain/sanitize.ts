const secretAssignment = /\b(api[_ -]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi
const quotedSecret = /("(?:api[_ -]?key|token|secret|password)"\s*:\s*")[^"]*(")/gi

/**
 * Event summaries are public demo evidence. Keep the useful operational fact,
 * but remove contact details, credentials, links, and control characters at
 * the persistence boundary so every snapshot/SSE consumer gets safe text.
 */
export function sanitizeEventSummary(value: string, maxLength = 600): string {
  const sanitized = value
    .replace(quotedSecret, '$1[REDACTED_SECRET]$2')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED_SECRET]')
    .replace(secretAssignment, '$1=[REDACTED_SECRET]')
    .replace(/\b(?:sk|rk|pk|whsec)[_-][A-Za-z0-9_-]{8,}\b/g, '[REDACTED_SECRET]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[EMAIL_REDACTED]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[PHONE_REDACTED]')
    .replace(/https?:\/\/\S+/gi, '[LINK_REDACTED]')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return sanitized.slice(0, Math.max(0, maxLength)) || 'Event recorded with sensitive details redacted.'
}
