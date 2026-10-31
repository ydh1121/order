// SYNTHETIC TEST DATA ONLY. Not prices, products, suppliers, or policy for sale.
export const fixtureVersion = 'synthetic-calculation-1.0.0';
export const asOf = '2026-11-01T00:00:00.000Z';
export const catalog = {version:fixtureVersion, products:[
  {id:'fixture-egg', groupId:'fixture-eggs', baseUnit:'each', units:{each:'1', tray:'30'}},
  {id:'fixture-flour', groupId:'fixture-dry-goods', baseUnit:'g', units:{g:'1', kg:'1000', bag:'2500'}}
]};
const approval = {status:'APPROVED', approvedBy:'FIXTURE_ONLY', legalSellerId:'FIXTURE_SELLER', approvedAt:'2026-10-01T00:00:00.000Z', effectiveFrom:'2026-10-01T00:00:00.000Z', priceRevision:'synthetic-r1', currency:'KRW'};
export const priceBook = {version:fixtureVersion, offers:[
  {...approval, id:'fixture-egg-price', approvalId:'FIXTURE_APPROVAL_EGG', productId:'fixture-egg', unit:'tray', unitPrice:'10.25'},
  {...approval, id:'fixture-flour-price', approvalId:'FIXTURE_APPROVAL_FLOUR', productId:'fixture-flour', unit:'kg', unitPrice:'3.20'}
]};
export const rules = {version:'synthetic-rules-1.0.0', rounding:{stage:'TOTAL', mode:'HALF_EVEN', scale:2}, costComponents:{tax:{amount:'0',ruleId:'TEST_NO_TAX'},shipping:{amount:'0',ruleId:'TEST_NO_SHIPPING'},discount:{amount:'0',ruleId:'TEST_NO_DISCOUNT'}}};
export const oneSite = {asOf, lines:[{id:'line-eggs', siteId:'fixture-site-a', productId:'fixture-egg', quantity:'2', unit:'tray', offerId:'fixture-egg-price'}]};
export const twoSites = {asOf, lines:[
  ...oneSite.lines,
  {id:'line-flour', siteId:'fixture-site-b', productId:'fixture-flour', quantity:'3', unit:'bag', offerId:'fixture-flour-price'}
],comparisonTotal:'50'};
