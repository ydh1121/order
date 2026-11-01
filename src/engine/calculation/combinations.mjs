import { engineResult } from '../contracts/result.mjs';

export const COMBINATION_RULE_VERSION = 'combination-contract-1.0.0';
export const MAX_CANDIDATES = 100000;
const scalar = value => value === null || typeof value === 'string' || typeof value === 'boolean' || Number.isSafeInteger(value);
const key = value => JSON.stringify(value);
const unique = values => new Set(values.map(key)).size === values.length;
const identifier = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);
const version = value => typeof value === 'string' && value.length > 0 && value.length <= 128;

function shuffle(values, next) {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generator(seed) {
  let state = seed || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function constraintValid(rule, axes) {
  if (!rule || !identifier(rule.id) || !version(rule.reasonCode)) return false;
  if (rule.type === 'allowedTuples') {
    return Array.isArray(rule.axes) && rule.axes.length > 0 && unique(rule.axes) &&
      rule.axes.every(id => axes.has(id)) && Array.isArray(rule.tuples) && rule.tuples.length <= 10000 &&
      rule.tuples.every(tuple => Array.isArray(tuple) && tuple.length === rule.axes.length && tuple.every(scalar)) &&
      unique(rule.tuples);
  }
  if (!axes.has(rule.axis)) return false;
  if (rule.type === 'eq' || rule.type === 'neq') return scalar(rule.value);
  if (rule.type === 'in') return Array.isArray(rule.values) && rule.values.every(scalar) && unique(rule.values);
  if (rule.type === 'gte' || rule.type === 'lte') {
    return Number.isSafeInteger(rule.value) && axes.get(rule.axis).values.every(Number.isSafeInteger);
  }
  return false;
}

function matches(rule, candidate) {
  switch (rule.type) {
    case 'eq': return candidate[rule.axis] === rule.value;
    case 'neq': return candidate[rule.axis] !== rule.value;
    case 'in': return rule.values.includes(candidate[rule.axis]);
    case 'gte': return candidate[rule.axis] >= rule.value;
    case 'lte': return candidate[rule.axis] <= rule.value;
    case 'allowedTuples': return rule.tuples.some(tuple => tuple.every((value, index) => candidate[rule.axes[index]] === value));
    default: return false;
  }
}

/**
 * Exhaustive declared-order traversal or a deterministic seeded permutation.
 * This enumerator does not select a recommendation or claim a lowest price.
 */
export function enumerateCombinations(input) {
  const finish = (status, reasonCodes, evidence = {}, extra = {}) => engineResult({
    status, reasonCodes, raw: input ?? null, normalized: null,
    ruleVersion: input?.ruleVersion ?? COMBINATION_RULE_VERSION,
    dataVersion: input?.dataVersion ?? null,
    evidence: { implementationRuleVersion: COMBINATION_RULE_VERSION, ...evidence }, ...extra
  });
  if (!input || !version(input.ruleVersion) || !version(input.dataVersion)) {
    return finish('INVALID', ['COMBINATION_VERSION_REQUIRED']);
  }
  if (!Array.isArray(input.axes) || input.axes.length === 0) return finish('UNAVAILABLE', ['AXIS_DATA_UNAVAILABLE']);
  if (input.axes.length > 32) return finish('INVALID', ['AXIS_LIMIT_EXCEEDED']);
  const axisIds = input.axes.map(axis => axis?.id);
  if (!axisIds.every(identifier) || !unique(axisIds)) return finish('INVALID', ['AXIS_ID_INVALID']);
  if (input.axes.some(axis => axis.values != null && !Array.isArray(axis.values))) {
    return finish('INVALID', ['AXIS_VALUE_OR_VERSION_INVALID']);
  }
  const unavailable = input.axes.filter(axis => axis.values == null || axis.values.length === 0).map(axis => axis.id);
  if (unavailable.length) return finish('UNAVAILABLE', ['AXIS_DATA_UNAVAILABLE'], { unavailableAxes: unavailable });
  if (input.axes.some(axis => !version(axis.dataVersion) || axis.values.length > 100000 || !axis.values.every(scalar) || !unique(axis.values))) {
    return finish('INVALID', ['AXIS_VALUE_OR_VERSION_INVALID']);
  }
  const axes = new Map(input.axes.map(axis => [axis.id, axis]));
  const constraints = input.constraints ?? [];
  if (!Array.isArray(constraints) || constraints.length > 1000 || !unique(constraints.map(rule => rule?.id)) || !constraints.every(rule => constraintValid(rule, axes))) {
    return finish('INVALID', ['CONSTRAINT_INVALID']);
  }
  const budget = input.maxCandidates ?? 10000;
  const seed = input.seed ?? 0;
  const order = input.order ?? 'declared';
  if (!Number.isSafeInteger(budget) || budget < 0 || budget > MAX_CANDIDATES ||
      !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !['declared', 'seeded'].includes(order)) {
    return finish('INVALID', ['SEARCH_CONFIGURATION_INVALID']);
  }
  // Compile tuple lookup once; never rescan a large tuple table per candidate.
  const compiledConstraints = constraints.map(rule => rule.type === 'allowedTuples'
    ? { ...rule, tupleKeys: new Set(rule.tuples.map(key)) } : rule);
  const next = generator(seed);
  const orderedAxes = input.axes.map(axis => ({ ...axis, values: order === 'seeded' ? shuffle(axis.values, next) : axis.values.slice() }));
  const total = orderedAxes.reduce((product, axis) => product * BigInt(axis.values.length), 1n);
  const visitedCount = total < BigInt(budget) ? total : BigInt(budget);
  const accepted = [];
  const excluded = [];
  for (let index = 0n; index < visitedCount; index++) {
    let remaining = index;
    const entries = [];
    for (let i = orderedAxes.length - 1; i >= 0; i--) {
      const axis = orderedAxes[i];
      const radix = BigInt(axis.values.length);
      entries.push([axis.id, axis.values[Number(remaining % radix)]]);
      remaining /= radix;
    }
    const candidate = Object.fromEntries(entries.reverse());
    const failed = compiledConstraints.filter(rule => rule.type === 'allowedTuples'
      ? !rule.tupleKeys.has(key(rule.axes.map(id => candidate[id])))
      : !matches(rule, candidate));
    if (failed.length) excluded.push({ candidate, constraintIds: failed.map(rule => rule.id), reasonCodes: failed.map(rule => rule.reasonCode) });
    else accepted.push(candidate);
  }
  const complete = visitedCount === total;
  const status = !complete ? 'UNKNOWN' : accepted.length ? 'VALID' : 'UNAVAILABLE';
  const reasons = !complete ? ['SEARCH_BUDGET_EXHAUSTED'] : accepted.length ? [] : ['NO_FEASIBLE_COMBINATIONS'];
  return finish(status, reasons, {
    totalCandidates: total.toString(), visitedCandidates: visitedCount.toString(), unexploredCandidates: (total - visitedCount).toString(),
    acceptedCandidates: String(accepted.length), excludedCandidates: String(excluded.length),
    complete, maxCandidates: budget, seed, order, traversal: 'mixed-radix-last-axis-fastest',
    seedAlgorithm: order === 'seeded' ? 'xorshift32-fisher-yates-v1' : null,
    axisVersions: Object.fromEntries(input.axes.map(axis => [axis.id, axis.dataVersion])),
    optimizationObjective: null, globalOptimumClaimed: false, sampling: false, pruning: false,
    stopReason: complete ? 'EXHAUSTED' : 'BUDGET', tieBreak: 'declared-axis-position'
  }, { accepted, excluded });
}
