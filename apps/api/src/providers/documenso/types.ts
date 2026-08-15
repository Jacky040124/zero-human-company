export type DocumensoSignerIdentity = {
  name: string
  identityRole: 'owner' | 'buyer'
}

export type DocumensoEnvelopeRequest = {
  owner: DocumensoSignerIdentity & { identityRole: 'owner' }
  buyer: DocumensoSignerIdentity & {
    identityRole: 'buyer'
    consentedAt: string
  }
}

export type DocumensoSigner = {
  name: string
  email: string
}

export type ResolvedDocumensoSigners = {
  owner: DocumensoSigner
  buyer: DocumensoSigner
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
  signers: ResolvedDocumensoSigners,
): DocumensoCreateEnvelopeInput {
  if (!templateId || !demoRunId || !externalId) {
    throw new Error('Documenso templateId, demoRunId, and externalId are required')
  }
  assertSignerIdentity(request.owner, 'owner')
  assertSignerIdentity(request.buyer, 'buyer')
  assertSigner(signers.owner, 'owner')
  assertSigner(signers.buyer, 'buyer')
  if (signers.owner.name !== request.owner.name || signers.buyer.name !== request.buyer.name) {
    throw new Error('Documenso resolved signer names must match the persisted signer identities')
  }
  if (!isIsoDate(request.buyer.consentedAt)) {
    throw new Error('Documenso buyer consentedAt must be an ISO date')
  }
  return {
    templateId,
    externalId,
    metadata: { demoRunId, buyerConsentedAt: request.buyer.consentedAt },
    recipients: [
      { ...signers.owner, role: 'SIGNER', signingOrder: 1, participant: 'owner' },
      { ...signers.buyer, role: 'SIGNER', signingOrder: 2, participant: 'buyer' },
    ],
  }
}

function assertSignerIdentity(signer: DocumensoSignerIdentity, participant: 'owner' | 'buyer'): void {
  if (!signer.name || signer.identityRole !== participant) {
    throw new Error(`Documenso ${participant} name and identity role are required`)
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
