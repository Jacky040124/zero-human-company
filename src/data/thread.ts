export type ThreadMessage = {
  id: string
  from: string
  role: 'quay' | 'buyer'
  time: string
  body: string
}

export const nordlichtThread: ThreadMessage[] = [
  {
    id: 'm1',
    from: 'Lead Factory · Worker 07',
    role: 'quay',
    time: '12 Aug · 09:14',
    body: 'Anja, sending the Lingnan Sofa 04 spec and FSC Mix certificate. We can hold a 2 × 40HQ slot in week 41 if fabric is confirmed this week.',
  },
  {
    id: 'm2',
    from: 'Anja Keller · Nordlicht',
    role: 'buyer',
    time: '12 Aug · 16:40',
    body: 'Thanks. We want 2 × 40HQ, 3-seat + armchair mix. Fabric must be a cream bouclé, OEM, not your stock card. Need FSC on the frames and a German-law supply agreement. Can you do that?',
  },
  {
    id: 'm3',
    from: 'Lead Factory · Worker 07',
    role: 'quay',
    time: '13 Aug · 08:02',
    body: 'Yes. Mill #17 in Shaoxing can dye the bouclé to your pantone. FSC Mix chain-of-custody is already on the oak frames. I will draft the supply agreement under German law and send a first pass today.',
  },
  {
    id: 'm4',
    from: 'Anja Keller · Nordlicht',
    role: 'buyer',
    time: '13 Aug · 11:21',
    body: 'Good. Inspection at factory before loading, and we need a 2% spare-parts carton. Payment 30/70 is fine. Send the draft.',
  },
]

export const nordlichtBrief = {
  goal: 'Lock 2 × 40HQ Lingnan Sofa 04 for Nordlicht, Hamburg, under German law.',
  next: 'Draft the supply agreement, then call a German commercial lawyer on Terac to redline it.',
  terms: [
    '2 × 40HQ · 3-seat + armchair mix',
    'OEM cream bouclé · mill #17',
    'FSC Mix on frames',
    'Factory inspection before loading',
    '2% spare-parts carton',
    '30 / 70 T/T · FOB Shenzhen',
  ],
}
