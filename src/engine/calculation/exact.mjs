/** Bounded exact rationals. JSON boundaries use strings, never binary decimals. */
export const MAX_DIGITS = 120;
const fail = code => { throw new RangeError(code); };
const abs = n => n < 0n ? -n : n;
function gcd(a, b) { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; }
function bounded(n) { if (abs(n).toString().length > MAX_DIGITS) fail('ARITHMETIC_RANGE'); }
export function rational(n, d = 1n) {
  if (typeof n !== 'bigint' || typeof d !== 'bigint') throw new TypeError('RATIONAL_BIGINT_REQUIRED');
  if (!d) fail('DIVISION_BY_ZERO');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d); n /= g; d /= g; bounded(n); bounded(d);
  return Object.freeze({ n, d });
}
export function exact(value) {
  if (typeof value === 'bigint') return rational(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError('EXACT_STRING_REQUIRED');
    return rational(BigInt(value));
  }
  if (typeof value !== 'string' || value.length > MAX_DIGITS + 3 || !/^-?\d+(?:\.\d+)?$/.test(value)) throw new TypeError('INVALID_EXACT_DECIMAL');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  return rational((negative ? -1n : 1n) * BigInt(whole + fraction), 10n ** BigInt(fraction.length));
}
export function fromRatio(value) {
  if (value && typeof value === 'object' && typeof value.numerator === 'string' && typeof value.denominator === 'string') {
    if (!/^-?\d+$/.test(value.numerator) || !/^\d+$/.test(value.denominator) || value.numerator.length > MAX_DIGITS + 1 || value.denominator.length > MAX_DIGITS) throw new TypeError('INVALID_RATIO');
    return rational(BigInt(value.numerator), BigInt(value.denominator));
  }
  return exact(value);
}
export const add = (a, b) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
export const subtract = (a, b) => rational(a.n * b.d - b.n * a.d, a.d * b.d);
export const multiply = (a, b) => rational(a.n * b.n, a.d * b.d);
export const divide = (a, b) => rational(a.n * b.d, a.d * b.n);
export const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
export const toJSON = a => ({ numerator: a.n.toString(), denominator: a.d.toString() });
export function round(value, { scale, mode }) {
  if (!Number.isInteger(scale) || scale < 0 || scale > 12 || !['HALF_UP', 'HALF_EVEN', 'DOWN', 'FLOOR', 'CEIL'].includes(mode)) throw new TypeError('INVALID_ROUNDING_RULE');
  const factor = 10n ** BigInt(scale);
  const scaled = value.n * factor;
  const sign = scaled < 0n ? -1n : 1n;
  let q = abs(scaled) / value.d;
  const remainder = abs(scaled) % value.d;
  const increment = mode === 'HALF_UP' ? remainder * 2n >= value.d :
    mode === 'HALF_EVEN' ? remainder * 2n > value.d || (remainder * 2n === value.d && q % 2n !== 0n) :
    mode === 'FLOOR' ? sign < 0n && remainder > 0n : mode === 'CEIL' ? sign > 0n && remainder > 0n : false;
  if (increment) q++;
  q *= sign; bounded(q);
  const digits = abs(q).toString().padStart(scale + 1, '0');
  const decimal = (q < 0n ? '-' : '') + (scale ? digits.slice(0, -scale) + '.' + digits.slice(-scale) : digits);
  return { decimal, minorUnits: q.toString(), scale, mode, exact: toJSON(value) };
}
