// Synthetic discrete choices only. Not an approved product catalogue or offer.
export const smallCombinationFixture = {
  ruleVersion: 'SYNTHETIC-CONSTRAINTS-v1', dataVersion: 'SYNTHETIC-COMBINATION-DATA-v1',
  axes: [
    { id: 'group', dataVersion: 'SYNTHETIC-GROUPS-v1', values: ['eggs', 'rice'] },
    { id: 'unit', dataVersion: 'SYNTHETIC-UNITS-v1', values: ['tray', 'bag'] },
    { id: 'site', dataVersion: 'SYNTHETIC-SITES-v1', values: ['siteA', 'siteB'] }
  ],
  constraints: [
    { id: 'matchingUnit', reasonCode: 'UNIT_NOT_IN_GROUP', type: 'allowedTuples', axes: ['group', 'unit'], tuples: [['eggs', 'tray'], ['rice', 'bag']] },
    { id: 'site', reasonCode: 'SITE_NOT_SELECTED', type: 'eq', axis: 'site', value: 'siteA' }
  ],
  maxCandidates: 8, seed: 49, order: 'declared'
};

// Hand-listed expected rows, deliberately independent of enumeration code.
export const smallAccepted = [
  { group: 'eggs', unit: 'tray', site: 'siteA' },
  { group: 'rice', unit: 'bag', site: 'siteA' }
];
export const smallExcluded = [
  [{ group: 'eggs', unit: 'tray', site: 'siteB' }, ['SITE_NOT_SELECTED']],
  [{ group: 'eggs', unit: 'bag', site: 'siteA' }, ['UNIT_NOT_IN_GROUP']],
  [{ group: 'eggs', unit: 'bag', site: 'siteB' }, ['UNIT_NOT_IN_GROUP', 'SITE_NOT_SELECTED']],
  [{ group: 'rice', unit: 'tray', site: 'siteA' }, ['UNIT_NOT_IN_GROUP']],
  [{ group: 'rice', unit: 'tray', site: 'siteB' }, ['UNIT_NOT_IN_GROUP', 'SITE_NOT_SELECTED']],
  [{ group: 'rice', unit: 'bag', site: 'siteB' }, ['SITE_NOT_SELECTED']]
];
