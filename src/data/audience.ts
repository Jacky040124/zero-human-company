export type AudienceSegment = {
  id: string
  title: string
  fit: string
  why: string
  examples: string
  shortLabel: string
  hint: string
}

export type AudiencePin = {
  id: string
  city: string
  segment: 'importers' | 'hospitality' | 'retail'
  x: number
  y: number
}

export const audience: AudienceSegment[] = [
  {
    id: 'importers',
    title: 'Independent EU importers',
    fit: 'Primary',
    why: 'They already run 40HQ programs, speak Incoterms, and can place a first order without a retailer committee.',
    examples: 'Hamburg, Rotterdam, Antwerp, Le Havre specialists.',
    shortLabel: 'Importers',
    hint: '4 ports',
  },
  {
    id: 'hospitality',
    title: 'Hospitality procurement',
    fit: 'Secondary',
    why: 'Hotel casegoods suite 22 matches 3-star and 4-star refurb cycles in DACH and Benelux.',
    examples: 'Buying groups and FF&E houses in Munich, Vienna, Amsterdam.',
    shortLabel: 'Hotel FF&E',
    hint: 'DACH',
  },
  {
    id: 'retail',
    title: 'Mid-market retail chains',
    fit: 'Watch',
    why: 'Longer cycle, higher brand control. Good once a reference importer is live.',
    examples: 'Regional chains in France, Nordics, and northern Italy.',
    shortLabel: 'Retail',
    hint: 'later',
  },
]

export const audiencePins: AudiencePin[] = [
  { id: 'hamburg', city: 'Hamburg', segment: 'importers', x: 54, y: 26 },
  { id: 'rotterdam', city: 'Rotterdam', segment: 'importers', x: 40, y: 32 },
  { id: 'antwerp', city: 'Antwerp', segment: 'importers', x: 38, y: 40 },
  { id: 'lehavre', city: 'Le Havre', segment: 'importers', x: 28, y: 42 },
  { id: 'munich', city: 'Munich', segment: 'hospitality', x: 56, y: 56 },
  { id: 'vienna', city: 'Vienna', segment: 'hospitality', x: 70, y: 54 },
  { id: 'paris', city: 'Paris', segment: 'retail', x: 32, y: 52 },
  { id: 'milan', city: 'Milan', segment: 'retail', x: 50, y: 70 },
]
