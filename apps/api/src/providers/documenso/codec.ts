import type { DocumensoCreateEnvelopeInput, DocumensoEnvelope } from './types.js'

/**
 * Isolates the evolving, account-specific Documenso v2 envelope schema.
 * Implementations must return null when reconciliation finds no envelope and
 * throw when a response cannot be verified.
 */
export interface DocumensoV2Codec {
  createEnvelopePath(): string
  reconciliationPath(externalId: string): string
  encodeCreateEnvelope(input: DocumensoCreateEnvelopeInput): unknown
  decodeCreatedEnvelope(response: unknown): DocumensoEnvelope
  decodeReconciledEnvelope(response: unknown): DocumensoEnvelope | null
}
