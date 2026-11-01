import test from 'node:test';
import assert from 'node:assert/strict';
import { exact, fromRatio, add, subtract, multiply, divide, compare, toJSON, round } from '../../src/engine/calculation/exact.mjs';

test('decimal 0.1 + 0.2 is exactly 3/10 with string JSON representation', () => {
  assert.deepEqual(toJSON(add(exact('0.1'), exact('0.2'))), {numerator:'3', denominator:'10'});
  assert.equal(JSON.stringify(toJSON(exact('0.00000001'))), '{"numerator":"1","denominator":"100000000"}');
  assert.throws(() => exact(0.1), /EXACT_STRING_REQUIRED/);
  assert.throws(() => exact(Number.MAX_SAFE_INTEGER + 1), /EXACT_STRING_REQUIRED/);
});
test('hand-calculated rational operations preserve values and signs', () => {
  const third = fromRatio({numerator:'1', denominator:'3'});
  assert.deepEqual(toJSON(multiply(third, exact('6'))), {numerator:'2',denominator:'1'});
  assert.deepEqual(toJSON(divide(exact('-1.25'), exact('2.5'))), {numerator:'-1',denominator:'2'});
  assert.deepEqual(toJSON(subtract(exact('0.2'), exact('0.3'))), {numerator:'-1',denominator:'10'});
  assert.equal(compare(exact('2'), exact('2.00')),0);
});
test('rounding ties and negatives use explicit distinct policies', () => {
  const cases = [['2.5',0,'HALF_UP','3'],['2.5',0,'HALF_EVEN','2'],['3.5',0,'HALF_EVEN','4'],['-2.5',0,'HALF_EVEN','-2'],['-2.5',0,'HALF_UP','-3'],['-1.21',1,'FLOOR','-1.3'],['-1.21',1,'CEIL','-1.2'],['-1.29',1,'DOWN','-1.2'],['1.005',2,'HALF_EVEN','1.00']];
  for (const [value, scale, mode, expected] of cases) assert.equal(round(exact(value),{scale,mode}).decimal,expected);
});
test('bounded exact inputs reject zero denominator, excessive range and implicit notation', () => {
  assert.throws(() => divide(exact(1), exact(0)), /DIVISION_BY_ZERO/);
  assert.throws(() => fromRatio({numerator:'1',denominator:'0'}), /DIVISION_BY_ZERO/);
  assert.throws(() => exact('1e3'), /INVALID_EXACT_DECIMAL/);
  assert.throws(() => multiply(exact('9'.repeat(120)),exact(10)), /ARITHMETIC_RANGE/);
  assert.throws(() => round(exact(1),{scale:13,mode:'HALF_UP'}), /INVALID_ROUNDING_RULE/);
});
test('add/subtract invariant on fixed integer grid uses independent identity', () => {
  for (let a=-15;a<=15;a++) for(let b=-5;b<=5;b++) assert.deepEqual(toJSON(subtract(add(exact(a),exact(b)),exact(b))),toJSON(exact(a)));
});
