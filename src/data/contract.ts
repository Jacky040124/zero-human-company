export type ContractClause = {
  id: string
  title: string
  body: string
  flagged?: string
}

export const contractMeta = {
  title: 'Furniture Supply Agreement',
  parties: 'Hengxin Home (Seller) and Nordlicht Import GmbH (Buyer)',
  governingLaw: 'Laws of the Federal Republic of Germany',
  forum: 'Hamburg',
  incoterm: 'FOB Shenzhen (Incoterms 2020)',
  goods: 'Lingnan Sofa 04, 2 × 40HQ, OEM cream bouclé',
  value: '€148,800 FOB',
}

export const contractClauses: ContractClause[] = [
  {
    id: '1',
    title: '1. Goods and quantity',
    body: 'Seller shall manufacture and deliver two (2) forty-foot high-cube containers of Lingnan Sofa 04 in a 3-seat and armchair mix, upholstered in Buyer-specified cream bouclé, together with a 2% spare-parts carton.',
  },
  {
    id: '2',
    title: '2. Price and payment',
    body: 'Price is €148,800 FOB Shenzhen. Buyer pays 30% by T/T on order confirmation and 70% against copy of B/L.',
  },
  {
    id: '3',
    title: '3. Inspection',
    body: 'Buyer or its appointed inspector may inspect finished goods at Seller’s Nanhai plant not later than five (5) days before the booked vessel.',
  },
  {
    id: '4',
    title: '4. Certificates',
    body: 'Each shipment shall include FSC Mix chain-of-custody documents for wooden frames and EN 12520 test reports for seating.',
  },
  {
    id: '5',
    title: '5. Liability',
    body: 'Seller’s aggregate liability under this Agreement shall not exceed the invoice value of the affected shipment.',
    flagged:
      'Under German law a hard cap this wide can fail for injury, product liability, and intent / gross negligence. Carve those out.',
  },
  {
    id: '6',
    title: '6. Governing law and forum',
    body: 'This Agreement is governed by the laws of the Federal Republic of Germany. The CISG is excluded. Courts in Hamburg have exclusive jurisdiction.',
    flagged:
      'CISG exclusion is fine. Exclusive Hamburg courts is acceptable for a German buyer, but add a service-of-process address in Foshan.',
  },
]
