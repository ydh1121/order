// Independent synthetic adversarial review data. No commercial prices or identities.
export const reviewRequest = {
  input: {
    asOf: '2026-11-01T00:00:00.000Z',
    lines: [
      { id: 'testLineA', siteId: 'testSiteA', productId: 'testProduct', unit: 'piece', quantity: '1', offerId: 'testOffer' },
      { id: 'testLineB', siteId: 'testSiteB', productId: 'testProduct', unit: 'piece', quantity: '1', offerId: 'testOffer' }
    ]
  },
  catalog: { version: 'SYNTHETIC-REVIEW-CATALOG-1', products: [{ id: 'testProduct', groupId: 'testGroup', baseUnit: 'piece', units: { piece: '1', dozen: '12' } }] },
  priceBook: { version: 'SYNTHETIC-REVIEW-PRICES-1', offers: [{
    id: 'testOffer', status: 'APPROVED', priceRevision: 'SYNTHETIC-1', approvalId: 'SYNTHETIC-APPROVAL', approvedBy: 'TEST-ONLY', legalSellerId: 'TEST-ONLY',
    productId: 'testProduct', unit: 'piece', currency: 'KRW', unitPrice: '0.005',
    approvedAt: '2026-10-01T00:00:00.000Z', effectiveFrom: '2026-10-01T00:00:00.000Z', effectiveTo: '2026-12-01T00:00:00.000Z'
  }] },
  rules: {
    version: 'SYNTHETIC-REVIEW-RULES-1', rounding: { stage: 'TOTAL', scale: 2, mode: 'HALF_UP' },
    costComponents: {
      tax: { ruleId: 'SYNTHETIC-NO-TAX', amount: '0' },
      shipping: { ruleId: 'SYNTHETIC-NO-SHIPPING', amount: '0' },
      discount: { ruleId: 'SYNTHETIC-NO-DISCOUNT', amount: '0' }
    }
  }
};
