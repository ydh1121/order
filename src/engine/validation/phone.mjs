import { engineResult } from '../contracts/result.mjs';
import { PHONE_RULE_VERSION, PHONE_DATA_VERSION, PHONE_REFERENCE, phoneType, possiblePrefix, detectPhoneType } from '../reference/phone-rules.mjs';

const clone = value => structuredClone(value);
const digitsOnly = value => /^[0-9]*$/.test(value);

function splitDigits(digits, spec, phase, width) {
  if (!spec) return [digits];
  if (spec.type === 'REPRESENTATIVE') return [digits.slice(0, 4), digits.slice(4)];
  const n = spec.prefixWidth;
  const middle = width ?? (phase === 'complete' && spec.totalWidths.includes(digits.length)
    ? digits.length - n - 4 : 4);
  return [digits.slice(0, n), digits.slice(n, n + middle), digits.slice(n + middle)];
}

/** Pure syntax verdict. VALID never proves allocation, activation, ownership, or a business gate. */
export function validatePhone(input) {
  const opts = typeof input === 'string' ? { raw: input } : input ?? {};
  const raw = opts.raw ?? (Array.isArray(opts.segments) ? opts.segments.join('-') : '');
  const phase = opts.phase ?? 'complete';
  let segments = opts.segments;
  let intent = opts.intent ?? { kind: 'automatic' };
  let spec = null;
  let digits = '';
  const evidence = {
    origin: opts.origin ?? 'input', required: opts.required ?? true, phase,
    reference: PHONE_REFERENCE.version,
    assignment: { status: 'UNKNOWN', reason: 'CURRENT_ALLOCATION_NOT_VERIFIED' },
    activation: 'NOT_CHECKED', ownership: 'NOT_CHECKED',
  };
  const result = (status, reason, normalized = null) => engineResult({
    status, reasonCodes: [reason], raw, normalized, field: opts.field ?? 'phone',
    ruleVersion: PHONE_RULE_VERSION, dataVersion: PHONE_DATA_VERSION,
    evidence: { ...evidence, intent: clone(intent), limits: spec ? clone(spec) : null },
    candidate: { segments: Array.isArray(segments) ? [...segments] : [], digits },
    support: 'KR_DOMESTIC_02_AREA_010_070_15_16_18_SYNTAX',
  });
  if ((typeof input !== 'string' && (input === null || typeof input !== 'object' || Array.isArray(input))) ||
      typeof raw !== 'string' || !['editing', 'complete'].includes(phase) ||
      !['automatic', 'explicit'].includes(intent.kind) ||
      (intent.middleWidth !== undefined && ![3, 4].includes(intent.middleWidth))) {
    // Do not coerce numbers: leading zeroes may already have been destroyed.
    return result('INVALID', 'PHONE_CONTRACT_INVALID');
  }
  if (!segments && raw.trim() === '') {
    segments = []; return result('EMPTY', opts.required === false ? 'PHONE_OPTIONAL_EMPTY' : 'PHONE_REQUIRED_EMPTY');
  }
  if (/^\s*\+/.test(raw)) return result('UNSUPPORTED', 'PHONE_INTERNATIONAL_UNSUPPORTED');
  if (/[^0-9\s()-]/.test(raw)) return result('INVALID', 'PHONE_CHARACTER_INVALID');
  if (/[()]/.test(raw) && !/^\s*\([0-9]{2,4}\)[ -]*[0-9]+[ -][0-9]+\s*$/.test(raw)) {
    return result('INVALID', 'PHONE_SEPARATOR_INVALID');
  }
  const text = raw.trim().replace(/^\(([0-9]+)\)/, '$1-');
  if (text !== '' && !/^[0-9]+(?:[ -]+[0-9]*){0,2}$/.test(text)) return result('INVALID', 'PHONE_SEPARATOR_INVALID');
  if (segments !== undefined) {
    if (!Array.isArray(segments) || segments.length > 3 ||
        segments.some(s => typeof s !== 'string' || !digitsOnly(s))) {
      segments = []; return result('INVALID', 'PHONE_SEGMENTS_INVALID');
    }
    digits = segments.join('');
    if (raw.replace(/[\s()-]/g, '') !== digits) return result('INVALID', 'PHONE_RAW_SEGMENTS_MISMATCH');
  } else {
    digits = text.replace(/[\s-]/g, '');
    if (/[ -]/.test(text)) {
      segments = text.split(/[ -]+/);
      intent = opts.intent ?? { kind: 'explicit', ...(segments.length === 3 ? { middleWidth: segments[1].length } : {}) };
    }
  }
  if (digits === '') { segments = segments ?? []; return result('EMPTY', opts.required === false ? 'PHONE_OPTIONAL_EMPTY' : 'PHONE_REQUIRED_EMPTY'); }
  if (segments && segments.some(s => s.length > 4)) return result('INVALID', 'PHONE_SEGMENT_TOO_LONG');
  spec = segments ? phoneType(segments[0]) : detectPhoneType(digits);
  if (!spec) {
    const prefix = segments ? segments[0] : digits;
    segments = segments ?? [digits];
    if (possiblePrefix(prefix)) return result('INCOMPLETE', 'PHONE_PREFIX_INCOMPLETE');
    return result('UNSUPPORTED', 'PHONE_TYPE_UNSUPPORTED');
  }
  // A partially typed formatted string may omit the last group. A caller-supplied
  // segment array is an explicit shape contract, and is never silently expanded.
  if (opts.segments === undefined && segments && segments.length < spec.widths.length) {
    while (segments.length < spec.widths.length) segments.push('');
  }
  // Automatic segmentation does not lock the middle width; completion can rebalance.
  if (segments && (segments.length !== spec.widths.length || segments.some((s, i) => s.length > spec.widths[i]))) {
    return result('INVALID', segments.length !== spec.widths.length ? 'PHONE_SEGMENT_COUNT' : 'PHONE_SEGMENT_TOO_LONG');
  }
  if (!segments || (intent.kind === 'automatic' && phase === 'complete')) {
    segments = splitDigits(digits, spec, phase);
  }
  if (segments.length !== spec.widths.length) return result('INVALID', 'PHONE_SEGMENT_COUNT');
  if (digits.length > Math.max(...spec.totalWidths)) return result('INVALID', 'PHONE_TOTAL_TOO_LONG');
  if (segments.some((s, i) => s.length > spec.widths[i])) return result('INVALID', 'PHONE_SEGMENT_TOO_LONG');
  if (spec.middleWidths.length && intent.kind === 'explicit' && intent.middleWidth !== undefined) {
    if (!spec.middleWidths.includes(intent.middleWidth)) return result('INVALID', 'PHONE_MIDDLE_WIDTH_UNSUPPORTED');
    if (segments[1].length > intent.middleWidth) return result('INVALID', 'PHONE_INTENT_WIDTH_EXCEEDED');
  }
  const complete = spec.type === 'REPRESENTATIVE'
    ? segments[0].length === 4 && segments[1].length === 4
    : spec.middleWidths.includes(segments[1].length) && segments[2].length === 4 &&
      (intent.kind !== 'explicit' || intent.middleWidth === undefined || segments[1].length === intent.middleWidth);
  if (!complete) return result('INCOMPLETE', 'PHONE_INCOMPLETE');
  const normalized = { type: spec.type, digits, formatted: segments.join('-'), segments: [...segments] };
  return result('VALID', 'PHONE_SYNTAX_VALID', normalized);
}

/** Restore without discarding corrupt bytes. originalRaw is an audit/recovery input, never a replacement address. */
export function createPhoneState(raw = '', { required = true } = {}) {
  const result = validatePhone({ raw, required, origin: 'restore' });
  const segments = result.normalized?.segments ?? result.candidate.segments;
  return {
    originalRaw: raw, raw, segments: [...segments], required,
    intent: result.evidence.intent,
    explicitClear: false, restoreStatus: result.status,
  };
}

/** DOM-independent edit reducer. Invalid candidates are returned separately; never silently truncated. */
export function editPhone(state, operation) {
  const previous = clone(state);
  let next = clone(state);
  const fail = reason => ({ accepted: false, state: previous, result: engineResult({
    status: 'INVALID', reasonCodes: [reason], raw: state.raw, normalized: null, field: 'phone',
    ruleVersion: PHONE_RULE_VERSION, dataVersion: PHONE_DATA_VERSION,
  }) });
  if (operation?.type === 'clear') {
    if (operation.explicit !== true) return fail('PHONE_CLEAR_REQUIRES_EXPLICIT_ACTION');
    next = { ...next, raw: '', segments: [], intent: { kind: 'automatic' }, explicitClear: true };
  } else if (operation?.type === 'move') {
    if (!['explicit', 'automatic'].includes(operation.cause)) return fail('PHONE_MOVE_CAUSE_REQUIRED');
    // An automatic focus change cannot create or erase a recorded explicit intent.
    if (operation.cause === 'explicit' && operation.from === 1 && operation.to === 2) {
      const width = next.segments[1]?.length;
      if (![3, 4].includes(width)) return fail('PHONE_MOVE_WIDTH_INVALID');
      next.intent = { kind: 'explicit', middleWidth: width };
    }
  } else if (operation?.type === 'replaceSegment' || (operation?.type === 'paste' && operation.scope === 'segment')) {
    const index = operation.index;
    if (!Number.isInteger(index) || index < 0 || index > 2 || typeof operation.text !== 'string' || !digitsOnly(operation.text)) return fail('PHONE_EDIT_INVALID');
    const spec = phoneType(next.segments[0] ?? '');
    const segmentCount = spec?.widths.length ?? 3;
    if (index >= segmentCount) return fail('PHONE_SEGMENT_INDEX');
    while (next.segments.length < segmentCount) next.segments.push('');
    next.segments[index] = operation.text;
    next.raw = next.segments.join('-');
    next.explicitClear = false;
    // Editing a segment does not itself record a deliberate early departure from it.
    if (index === 0) delete next.intent.middleWidth;
  } else if (operation?.type === 'paste' && operation.scope === 'field') {
    if (typeof operation.text !== 'string') return fail('PHONE_EDIT_INVALID');
    const restored = createPhoneState(operation.text, { required: state.required });
    next = { ...restored, originalRaw: state.originalRaw, explicitClear: false };
  } else return fail('PHONE_OPERATION_UNSUPPORTED');
  const result = validatePhone({ raw: next.raw, segments: next.segments, intent: next.intent,
    required: next.required, phase: 'editing', origin: 'edit' });
  const priorVerdict = validatePhone({ raw: state.raw, segments: state.segments, intent: state.intent });
  const reducingCorruption = priorVerdict.status === 'INVALID' && result.status === 'INVALID' && next.raw.length < state.raw.length;
  const accepted = ['EMPTY', 'INCOMPLETE', 'VALID'].includes(result.status) || reducingCorruption;
  return { accepted, state: accepted ? next : previous, candidate: next, result };
}

/** Single save/get/format decision: callers must consume the same normalized object. */
export function finalizePhone(state) {
  return validatePhone({ raw: state.raw, segments: state.segments, intent: state.intent,
    required: state.required, phase: 'complete', origin: 'finalize' });
}
