/** Syntax coverage, not a directory of allocated/active subscriber numbers. */
export const PHONE_RULE_VERSION = 'phone-rules-1.0.0';
export const PHONE_DATA_VERSION = 'kr-number-reference-20261101-partial';
export const AREA_PREFIXES = Object.freeze([
  '031', '032', '033', '041', '042', '043', '044', '051', '052', '053',
  '054', '055', '061', '062', '063', '064',
]);
export const PHONE_REFERENCE = Object.freeze({
  version: PHONE_DATA_VERSION,
  observedOn: '2026-11-01',
  source: 'https://law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000206775',
  sourceTitle: '전기통신번호관리세칙',
  sourceRevision: '과학기술정보통신부고시 제2021-93호 / 시행 2021-12-07',
  verification: 'SOURCE_METADATA_ONLY_CURRENT_TABLES_NOT_FULLY_VERIFIED',
  historicalBodySource: 'https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000095072',
  ituHistoricalDocument: {
    url: 'https://www.itu.int/dms_pub/itu-t/oth/02/02/T02020000720001MSWE.doc',
    indexPostedDate: '2021-11-08', communicationDate: '2004-03-01',
    sha256: 'eff2c0cd010ad6e9e65ade5ed503f56a51a6ac8e1f1cb9d1d28101bf5f5bbad7',
    use: 'HISTORICAL_ONLY_NOT_CURRENT_ALLOCATION',
  },
  limitations: ['NOT_FULL_ALLOCATION_TABLE', 'NO_ACTIVATION_CHECK', 'NO_OWNERSHIP_CHECK'],
});

export function phoneType(prefix) {
  if (prefix === '02') return { type: 'SEOUL', prefixWidth: 2, widths: [2, 4, 4], middleWidths: [3, 4], totalWidths: [9, 10] };
  if (AREA_PREFIXES.includes(prefix)) return { type: 'AREA', prefixWidth: 3, widths: [3, 4, 4], middleWidths: [3, 4], totalWidths: [10, 11] };
  if (prefix === '010' || prefix === '070') return { type: prefix === '010' ? 'MOBILE' : 'INTERNET', prefixWidth: 3, widths: [3, 4, 4], middleWidths: [4], totalWidths: [11] };
  if (/^1[568][0-9]{2}$/.test(prefix)) return { type: 'REPRESENTATIVE', prefixWidth: 4, widths: [4, 4], middleWidths: [], totalWidths: [8] };
  return null;
}

export function possiblePrefix(prefix) {
  return ['02', '010', '070', ...AREA_PREFIXES].some(p => p.startsWith(prefix)) ||
    (/^1[568]?[0-9]{0,2}$/.test(prefix) && prefix.length < 4);
}

export function detectPhoneType(digits) {
  return phoneType(digits.slice(0, 2)) || phoneType(digits.slice(0, 3)) || phoneType(digits.slice(0, 4));
}
