export interface Field {
  id: string
  name: string
  crop: string
  acres: number
  health: number // 0-100 NDVI-derived health score
  pestRisk: 'Low' | 'Moderate' | 'High'
  lastSprayed: string
  moisture: number // %
  // CSS grid placement to build an irregular farm-map layout
  gridArea: string
  // seed that varies the NDVI blotch pattern per field
  seed: number
  demoEnabled: boolean
}

export const FIELDS: Field[] = [
  {
    id: 'north-ridge',
    name: 'North Ridge',
    crop: 'Almonds',
    acres: 128,
    health: 71,
    pestRisk: 'High',
    lastSprayed: '14 days ago',
    moisture: 34,
    gridArea: '1 / 1 / 3 / 3',
    seed: 7,
    demoEnabled: true,
  },
  {
    id: 'east-terrace',
    name: 'East Terrace',
    crop: 'Tomatoes',
    acres: 86,
    health: 88,
    pestRisk: 'Low',
    lastSprayed: '6 days ago',
    moisture: 41,
    gridArea: '1 / 3 / 2 / 5',
    seed: 13,
    demoEnabled: true,
  },
  {
    id: 'creek-bend',
    name: 'Creek Bend',
    crop: 'Grapes',
    acres: 64,
    health: 82,
    pestRisk: 'Moderate',
    lastSprayed: '9 days ago',
    moisture: 38,
    gridArea: '2 / 3 / 3 / 4',
    seed: 29,
    demoEnabled: true,
  },
  {
    id: 'south-flat',
    name: 'South Flat',
    crop: 'Cotton',
    acres: 152,
    health: 77,
    pestRisk: 'Moderate',
    lastSprayed: '11 days ago',
    moisture: 29,
    gridArea: '3 / 1 / 4 / 3',
    seed: 41,
    demoEnabled: true,
  },
  {
    id: 'west-hollow',
    name: 'West Hollow',
    crop: 'Pistachios',
    acres: 97,
    health: 91,
    pestRisk: 'Low',
    lastSprayed: '4 days ago',
    moisture: 45,
    gridArea: '2 / 4 / 4 / 5',
    seed: 53,
    demoEnabled: true,
  },
]
