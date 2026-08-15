const secretAssignment = /\b(api[_ -]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi
const quotedSecret = /("(?:api[_ -]?key|token|secret|password)"\s*:\s*")[^"]*(")/gi

/**
 * Remove values that must not cross a persistence or public-display boundary.
 * Callers choose their own length limit and whether an empty result needs a
 * domain-specific placeholder.
 */
export function sanitizeSensitiveText(value: string, maxLength: number): string {
  return value
    .replace(quotedSecret, '$1[REDACTED_SECRET]$2')
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED_SECRET]')
    .replace(secretAssignment, '$1=[REDACTED_SECRET]')
    .replace(/\b(?:sk|rk|pk|whsec)[_-][A-Za-z0-9_-]{8,}\b/g, '[REDACTED_SECRET]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL_REDACTED]')
    .replace(/(?<!\w)(?:\+?\d[\d ().-]{7,}\d)(?!\w)/g, '[PHONE_REDACTED]')
    .replace(/https?:\/\/[^\s<>()]+/gi, '[LINK_REDACTED]')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, Math.max(0, maxLength))
}

/**
 * Event summaries are public demo evidence. Keep the useful operational fact,
 * but remove contact details, credentials, links, and control characters at
 * the persistence boundary so every snapshot/SSE consumer gets safe text.
 */
export function sanitizeEventSummary(value: string, maxLength = 600): string {
  return sanitizeSensitiveText(value, maxLength) || 'Event recorded with sensitive details redacted.'
}
