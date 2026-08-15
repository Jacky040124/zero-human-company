export const teracCall = {
  method: 'POST',
  path: '/mcp/v1/labor',
  task: 'Review an AI-drafted furniture supply agreement under German law. Flag choice-of-law, liability, and inspection issues. Return redlines, not a rewrite.',
  skills: ['German commercial law', 'CISG', 'product liability', 'Incoterms'],
  deadline: '90 minutes',
}

export const teracLawyer = {
  id: 'TR-LV41-DE02',
  name: 'Lena Vogt',
  title: 'Commercial counsel',
  country: 'Germany',
  flag: '🇩🇪',
  years: 11,
  rate: '€180 / hr',
  match: 96,
  attestations: ['ID', 'LI', 'EM', 'IP'] as const,
  bar: 'Hamburg',
  note: 'Trade and supply agreements for DACH importers. Reviews AI drafts the way she reviews a junior associate.',
}

export const teracReview = {
  status: 'Verified review returned',
  elapsed: '41 min',
  summary:
    'Draft is usable. Two clauses need changes before Nordlicht’s counsel will countersign: liability cap and service of process.',
}
