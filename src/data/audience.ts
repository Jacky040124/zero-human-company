export type AudienceSegment = 'importer' | 'hotel' | 'retail'

export type AudienceCandidate = {
  id: string
  company: string
  city: string
  country: string
  segment: AudienceSegment
  why: string
}

export const audienceCandidates: AudienceCandidate[] = [
  {
    id: 'nordlicht',
    company: 'Nordlicht Import',
    city: 'Hamburg',
    country: 'Germany',
    segment: 'importer',
    why: 'customs filings match — imports FSC furniture',
  },
  {
    id: 'maas',
    company: 'Maas Interiors',
    city: 'Rotterdam',
    country: 'Netherlands',
    segment: 'importer',
    why: '40HQ program, 2 sailings/quarter',
  },
  {
    id: 'brabant',
    company: 'Brabant Wonen',
    city: 'Eindhoven',
    country: 'Netherlands',
    segment: 'importer',
    why: 'matched from Dutch customs filings',
  },
  {
    id: 'gota',
    company: 'Göta Living',
    city: 'Gothenburg',
    country: 'Sweden',
    segment: 'importer',
    why: 'West Coast importer, first letter drafted',
  },
  {
    id: 'oster',
    company: 'Oster Wohnen',
    city: 'Munich',
    country: 'Germany',
    segment: 'hotel',
    why: 'refurb cycle Q4, 40 rooms',
  },
  {
    id: 'elbe',
    company: 'Elbe Contract',
    city: 'Dresden',
    country: 'Germany',
    segment: 'hotel',
    why: '24-room casegoods, PO in review',
  },
  {
    id: 'havn',
    company: 'Havn Studio',
    city: 'Copenhagen',
    country: 'Denmark',
    segment: 'retail',
    why: 'showroom sample pair, MOQ still open',
  },
  {
    id: 'atelier-loire',
    company: 'Atelier Loire',
    city: 'Nantes',
    country: 'France',
    segment: 'retail',
    why: 'oak dining book, fabric pick pending',
  },
]

export const defaultAudienceIds = audienceCandidates
  .filter((candidate) => candidate.segment !== 'retail')
  .map((candidate) => candidate.id)
