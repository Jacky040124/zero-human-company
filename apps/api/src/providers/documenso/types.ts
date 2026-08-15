export type DocumensoSigner = {
  name: string
  email: string
}

export type DocumensoEnvelopeRequest = {
  owner: DocumensoSigner
  buyer: DocumensoSigner & {
    consentedAt: string
  }
}

export type DocumensoOrderedSigner = DocumensoSigner & {
  role: 'SIGNER'
  signingOrder: 1 | 2
  participant: 'owner' | 'buyer'
}

export type DocumensoCreateEnvelopeInput = {
  templateId: string
  externalId: string
  metadata: {
    demoRunId: string
    buyerConsentedAt: string
  }
  recipients: readonly [DocumensoOrderedSigner, DocumensoOrderedSigner]
}

export type DocumensoEnvelope = {
  envelopeId: string
  externalId: string
  status: string
}

export type DocumensoEnvelopeData = DocumensoEnvelope & {
  templateId: string
  signingOrder: readonly ['owner', 'buyer']
}

export function createEnvelopeInput(
  templateId: string,
  demoRunId: string,
  externalId: string,
  request: DocumensoEnvelopeRequest,
): DocumensoCreateEnvelopeInput {
  if (!templateId || !demoRunId || !externalId) {
    throw new Error('Documenso templateId, demoRunId, and externalId are required')
  }
  assertSigner(request.owner, 'owner')
  assertSigner(request.buyer, 'buyer')
  if (!isIsoDate(request.buyer.consentedAt)) {
    throw new Error('Documenso buyer consentedAt must be an ISO date')
  }
  return {
    templateId,
    externalId,
    metadata: { demoRunId, buyerConsentedAt: request.buyer.consentedAt },
    recipients: [
      { ...request.owner, role: 'SIGNER', signingOrder: 1, participant: 'owner' },
      { name: request.buyer.name, email: request.buyer.email, role: 'SIGNER', signingOrder: 2, participant: 'buyer' },
    ],
  }
}

function assertSigner(signer: DocumensoSigner, participant: string): void {
  if (!signer.name || !signer.email || !signer.email.includes('@')) {
    throw new Error(`Documenso ${participant} name and email are required`)
  }
}

function isIsoDate(value: string): boolean {
  return Boolean(value) && Number.isFinite(Date.parse(value))
}
