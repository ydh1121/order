// Synthetic examples only; no call, SMS, ownership claim, or subscriber lookup.
export const PHONE_FIXTURE_VERSION = 'phone-fixtures-1.0.0';
export const phoneCases = [
  ['SEOUL_9', '022345678', 'VALID', '02-234-5678'],
  ['SEOUL_10', '0223456789', 'VALID', '02-2345-6789'],
  ['AREA_10', '0312345678', 'VALID', '031-234-5678'],
  ['AREA_11', '03123456789', 'VALID', '031-2345-6789'],
  ['MOBILE_11', '01023456789', 'VALID', '010-2345-6789'],
  ['IP_11', '07023456789', 'VALID', '070-2345-6789'],
  ['REP_8', '15881234', 'VALID', '1588-1234'],
  ['REP_16', '16661234', 'VALID', '1666-1234'],
  ['REP_18', '18001234', 'VALID', '1800-1234'],
  ['IP_MIDDLE_3', '070-234-5678', 'INVALID', null],
  ['RESTORE_OVERLONG', '010-1234-12345678', 'INVALID', null],
  ['TYPE_UNSUPPORTED', '050512345678', 'UNSUPPORTED', null],
  ['INTERNATIONAL', '+82 10 2345 6789', 'UNSUPPORTED', null],
  ['LETTER_NOT_STRIPPED', '010abc23456789', 'INVALID', null],
  ['DOUBLE_HYPHEN', '02--234-5678', 'VALID', '02-234-5678'],
];
