import type { TeracAccountCodec, TeracCompleteStudy } from './terac/index.js'
import type { DocumensoCreateEnvelopeInput, DocumensoEnvelope, DocumensoV2Codec } from './documenso/index.js'

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Provider returned a non-object payload')
  return value as Record<string, unknown>
}

export const standardTeracCodec: TeracAccountCodec = {
  encodeStudy(request, context) {
    return {
      externalId: context.demoRunId,
      idempotencyKey: context.idempotencyKey,
      mode: 'blind_comparative',
      audience: request.audience,
      question: request.question,
      rubric: context.rubric,
      baseline: request.baseline,
      candidates: request.candidates,
    }
  },
  decodeStudy(value): TeracCompleteStudy {
    const body = record(value)
    const scores = body.scores ?? record(body.result).scores
    return {
      status: body.status,
      studyId: String(body.studyId ?? body.id ?? ''),
      ...(body.selectedWinnerId ? { providerSelectedWinnerId: String(body.selectedWinnerId) } : {}),
      ...(typeof body.respondentCount === 'number' ? { respondentCount: body.respondentCount } : {}),
      ...(body.baselineScores ? { baselineScores: body.baselineScores } : {}),
      scores,
    } as TeracCompleteStudy
  },
}

export function standardDocumensoCodec(
  createPath: string,
  reconcilePath: string,
  ownerRecipientId: string,
  buyerRecipientId: string,
): DocumensoV2Codec {
  if (!createPath || !reconcilePath || !ownerRecipientId || !buyerRecipientId) {
    throw new Error('Documenso paths and both template recipient IDs are required')
  }
  const decode = (value: unknown): DocumensoEnvelope => {
    const outer = record(value)
    const body = outer.data && typeof outer.data === 'object' ? record(outer.data) : outer
    return {
      envelopeId: String(body.id ?? body.documentId ?? ''),
      externalId: String(body.externalId ?? body.external_id ?? ''),
      status: String(body.status ?? ''),
    }
  }
  return {
    createEnvelopePath: () => createPath,
    reconciliationPath: (externalId) => reconcilePath.replace('{externalId}', encodeURIComponent(externalId)),
    encodeCreateEnvelope(input: DocumensoCreateEnvelopeInput) {
      return {
        templateId: input.templateId,
        externalId: input.externalId,
        distributeDocument: true,
        override: { meta: { signingOrder: 'SEQUENTIAL' } },
        recipients: input.recipients.map((recipient) => ({
          id: recipient.participant === 'owner' ? recipientId(ownerRecipientId) : recipientId(buyerRecipientId),
          name: recipient.name,
          email: recipient.email,
        })),
      }
    },
    decodeCreatedEnvelope: decode,
    decodeReconciledEnvelope(value) {
      const outer = record(value)
      const candidates = Array.isArray(outer.data) ? outer.data : Array.isArray(outer.documents) ? outer.documents : null
      if (candidates) return candidates.length ? decode(candidates[0]) : null
      if (outer.found === false) return null
      return decode(value)
    },
  }
}

function recipientId(value: string): string | number {
  return /^\d+$/.test(value) ? Number(value) : value
}
