export type Product = {
  id: string
  name: string
  nameZh: string
  category: string
  sku: string
  price: string
  moq: string
  leadTime: string
  notes: string
  image: string
  list: number
  target: number
  floor: number
  unit: string
}

export const catalog: Product[] = [
  {
    id: 'hx-sofa-04',
    name: 'Lingnan Sofa 04',
    nameZh: '岭南沙发 04',
    category: 'Upholstery',
    sku: 'HX-SF-04',
    price: '€186 / seat FOB',
    moq: '2 × 40HQ',
    leadTime: '35 days',
    notes: 'Removable covers. 14 in-stock fabrics, 40 OEM mills.',
    image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=640&q=80',
    list: 186,
    target: 172,
    floor: 158,
    unit: 'seat',
  },
  {
    id: 'hx-dining-12',
    name: 'Nanhai Dining Table 12',
    nameZh: '南海餐桌 12',
    category: 'Dining',
    sku: 'HX-DT-12',
    price: '€214 / set FOB',
    moq: '1 × 40HQ',
    leadTime: '32 days',
    notes: 'White oak or walnut. Extension leaf optional.',
    image: 'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=640&q=80',
    list: 214,
    target: 198,
    floor: 186,
    unit: 'set',
  },
  {
    id: 'hx-side-08',
    name: 'Pearl Sideboard 08',
    nameZh: '珠水边柜 08',
    category: 'Storage',
    sku: 'HX-SB-08',
    price: '€168 / unit FOB',
    moq: '1 × 40HQ',
    leadTime: '30 days',
    notes: 'Soft-close, FSC Mix plywood core.',
    image: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=640&q=80',
    list: 168,
    target: 158,
    floor: 148,
    unit: 'unit',
  },
  {
    id: 'hx-hotel-22',
    name: 'Hotel Casegoods Suite 22',
    nameZh: '酒店套房 22',
    category: 'Hospitality',
    sku: 'HX-HT-22',
    price: '€390 / room FOB',
    moq: '40 rooms',
    leadTime: '45 days',
    notes: 'Headboard, desk, luggage bench, minibar cabinet.',
    image: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=640&q=80',
    list: 390,
    target: 362,
    floor: 332,
    unit: 'room',
  },
  {
    id: 'hx-chair-19',
    name: 'Canton Dining Chair 19',
    nameZh: '广府餐椅 19',
    category: 'Dining',
    sku: 'HX-CH-19',
    price: '€41 / chair FOB',
    moq: '1 × 40HQ',
    leadTime: '28 days',
    notes: 'EN 12520. Stackable in cartons of 4.',
    image: 'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=640&q=80',
    list: 41,
    target: 38,
    floor: 35,
    unit: 'chair',
  },
  {
    id: 'hx-bed-03',
    name: 'West River Bed 03',
    nameZh: '西江床 03',
    category: 'Bedroom',
    sku: 'HX-BD-03',
    price: '€255 / set FOB',
    moq: '1 × 40HQ',
    leadTime: '38 days',
    notes: 'King / queen. Upholstered headboard, slat base.',
    image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=640&q=80',
    list: 255,
    target: 236,
    floor: 218,
    unit: 'set',
  },
]
