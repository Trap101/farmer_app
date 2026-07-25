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
  /**
   * Set only on fields the forecast engine can actually model. The engine's
   * thermal constants in src/phenology.ts are soybean-aphid-specific, so a
   * field without this shows the feed and weather but no spray forecast —
   * better than rendering an aphid threshold under an almond block.
   */
  engine?: EngineConfig
}

export interface EngineConfig {
  /** field_id sent to the engine; must match across scouting visits. */
  fieldId: string
  /** Drives degree-day accumulation — the forecast is only as local as this. */
  lat: number
  lon: number
  /** Shown in the UI so the coordinates above are never a silent claim. */
  location: string
  /** Soybean reproductive stage, e.g. "R3". Guard rails key off this. */
  growthStage: string
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
    crop: 'Soybean',
    acres: 152,
    health: 77,
    pestRisk: 'Moderate',
    lastSprayed: '11 days ago',
    moisture: 29,
    gridArea: '3 / 1 / 4 / 3',
    seed: 41,
    demoEnabled: true,
    // The one field wired to the forecast engine. Coordinates are Minnesota,
    // not Fresno: at Fresno's July temperatures the suitability curve
    // suppresses aphid growth hard enough that the same counts return
    // BELOW_THRESHOLD with a null confidence interval. Move these to
    // 36.7378 / -119.7871 to see that for yourself.
    engine: {
      fieldId: 'South Flat',
      lat: 44.98,
      lon: -93.26,
      location: 'Renville County, MN',
      growthStage: 'R3',
    },
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
