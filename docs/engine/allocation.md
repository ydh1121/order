# Monthly allocation contract 1.0.0 — MSG0504 §4

`src/engine/calculation/allocation.mjs` is a DOM-independent, exact quantity core. It does not write storage or modify Q4 delivery quantity. `T` is monthly total, `A_i` monthly allocation, `Q_i` quantity per delivery, and `N_i` delivery count. This module computes `A_i` and never substitutes it for `Q_i` or infers `N_i` from 30 days/four weeks.

Read-only UX baseline: `ORDER_MSG0497_REGULAR_FULLPAGE_WORKING_UNVERIFIED.html`, SHA-256 `e13f200945b9277e986b1994fc4f91998fc68f18d1bcbc0b69cb8dc6dd54d6a8`. In that source, `monthlyDemandQty`/review `monthly` means monthly allocation, while `qty`/review `base` means per-delivery quantity. `CODE1_UI.sumPlan` currently divides residual among blank rows for “maximum” hints and uses a literal tray unit. The independent replacement removes that equal-split assumption and obtains units from the caller. HTML/CSS/input handlers are not modified by this module.

## State and exact quantities

```js
const state = {
  revision: 1,
  lines: [{
    lineId: 'sku-stable-id', specVersion: 'spec-v1',
    total: {raw: '200', unit: 'each'}, locationIds: ['site-a','site-b'],
    unitTable: {version:'units-v1',baseUnit:'each',factors:{each:'1',tray:'30'}}
  }],
  locations: [{locationId:'site-a'},{locationId:'site-b'}],
  allocations: [{lineId:'sku-stable-id',locationId:'site-a',
    quantity:{raw:'50',unit:'each'},source:'manual',mode:'FLEX'}],
  receipts: []
};
```

This is a quantity example, not a supply catalogue. Stable IDs select linked sites; array position and display name are irrelevant. Other SKU allocations and unlinked Q3 locations are excluded. `unitTable.factors` explicitly converts each input unit to the base unit. Packaging spec never supplies an implicit unit conversion. A 30-count pack with monthly usage 200 **each** and site A 50 **each** is valid; no multiple-of-30 check applies to consumption allocation.

Quantity objects preserve `raw` and `unit`. Positive integer monthly inputs are compatible with the present UX. A fractional decimal needs explicit `line.quantityPolicy.allowFractionalMonthly:true`; otherwise it yields `POLICY_UNRESOLVED`, not an invented rounding rule. Invalid characters and zero are invalid. Empty remains empty. `composing:true` or an explicit editing trailing decimal is incomplete, with no confirmed numeric residual. All exact sums, capacities, and base quantities use `{numerator,denominator}` decimal strings from the existing bounded rational arithmetic. No Number approximation is used.

Explicit unit conversion can produce e.g. `50 each → 5/3 tray`, represented as `{raw:'5/3',unit:'tray',representation:'rational',conversionReviewed:true,conversionFrom:{raw:'50',unit:'each'}}`. This preserves base quantity and prior raw input. Direct `set` across units is rejected; use the reviewed conversion operation. Unit/spec changes invalidate an old transaction snapshot.

All linked sites are required in this contract. Optional-location policy has not been specified; an explicit `required:false` returns `POLICY_UNRESOLVED`. Optional `line.minimums:[{locationId,quantity}]` declares a minimum for that SKU/site. `locations[].minimum` is accepted only when the site belongs to one SKU; an ambiguous cross-SKU minimum is rejected instead of imposing an egg-unit rule on another product. No default commercial MOQ or shipping pack minimum is invented.

## Evaluation

`evaluateAllocation({state,lineId,draft:{scope,entries}})` returns the common envelope. `scope` lists only editable location IDs. `entries` contains replacement drafts (`locationId`, `quantity`, `source:manual|derived`, optional `mode`). A draft replaces the same saved value; the two are never summed. Saved values outside scope remain fixed, including previously derived saved values.

Normalized output separates:

- `fixedSum`: valid fixed/manual base quantity; editable derived drafts are excluded.
- `residualBeforeSuggestions`: total minus fixed sum.
- `proposals`: a derived quantity for exactly one remaining editable blank/derived site, provided its residual is positive and satisfies its declared minimum.
- `projectedResidual`: residual after proposals, without storing them.
- `sites[].currentMaximum`: total minus **other** fixed values and explicitly reserved minimums of other unfilled sites.
- `sites[].additionalCapacity`: currentMaximum minus the displayed current/proposed value. It is not the whole-input maximum.
- `projectedComplete`, `storedComplete`, `canConfirm`: separate proposed completeness, previously saved completeness, and valid confirmation eligibility.

Two or more blanks yield the whole unallocated amount and independent capacities, never hidden equal splitting. A proposal returns `INCOMPLETE / DERIVED_PROPOSAL_AWAITING_CONFIRMATION`, even when `projectedComplete` is true. It must not mark saved completion. Zero residual with another required blank creates no zero proposal. Invalid/unknown other values make numeric totals and maxima null; they are not treated as zero.

| Independent case | Expected result |
| --- | --- |
| Total 200, A manual 50, B blank | Fixed50, residual150, B derived proposal150 |
| A changes to60, editable B derived150 | B proposal140 |
| A changes to60, B manual150 | Preserve150, excess10 |
| B saved derived150 outside edit scope | Fixed150; A60 produces excess10 |
| A50, B/C blank | Residual150; B/C each maximum150, no75/75 |
| A50 with derived B, edit A | A whole maximum200; additional capacity150 |
| A50, B blank, C blank minimum20 | B maximum130; no invented distribution |
| Total240 or100, A50, B derived | B190 or50 |
| One linked empty site | Reuse whole monthly200 as derived proposal |

## Transactions and caller integration

```js
import {beginAllocationEdit,editAllocation,evaluateAllocation,
  confirmAllocation,cancelAllocation} from '../../src/engine/calculation/allocation.mjs';
let session = beginAllocationEdit(state, {
  lineId:'sku-stable-id',scope:['site-a','site-b'],
  transactionId:'caller-generated-unique-id',exposure:{previousErrors:[]}
}).session;
session = editAllocation(state,session,{type:'refreshDerived'}).session;
const preview = evaluateAllocation({state,lineId:session.lineId,draft:session});
// Only an explicit confirmation may apply the proposed state:
const result = confirmAllocation(state,session,{
  expectedDraftRevision:session.revision,acceptProposals:true
});
if(result.committed) persistOnce(result.state); // persistence adapter owned by caller
```

`beginAllocationEdit` captures state revision and a canonical source snapshot fingerprint, draft revision0, edit scope, and exposure snapshot. No random ID, clock, DOM, or persistence is embedded. `editAllocation` returns a new session, never mutating its arguments. Supported operations:

| Operation | Fields and behavior |
| --- | --- |
| `set` | `locationId,quantity`; preserves unit; marks manual even if user types the same derived number |
| `clear` | `locationId`; leaves a real empty quantity |
| `refreshDerived` | Materializes current proposal into the session only; recomputes derived values and clears obsolete derived proposals without changing manual values |
| `clone` | `from,targets`; scope-checked atomic draft copy, marks copies manual, re-evaluates complete SKU sum |
| `convertUnit` | `locationId,unit,reviewed:true`; exact conversion and original raw provenance |
| `exposure` | `value`; captures current UI exposure without changing saved quantities |

Confirmation requires current source revision/fingerprint and current `expectedDraftRevision`. Draft integrity detects accidental direct mutation that bypassed the reducer. A proposal additionally requires `acceptProposals:true`. Confirmation returns a new state and exactly one logical `writes:1`, never actually calls persistence. It updates only scoped monthly entries, retains unrelated fields/lines and Q2 total, increments state revision, and records a transaction receipt. Same transaction plus same token returns `ALLOCATION_ALREADY_COMMITTED`, `writes:0`; same transaction reused with another draft is blocked. The browser adapter must persist the returned state once and serialize cross-tab storage writes; this pure client transaction is not a server concurrency or authorization mechanism.

`cancelAllocation(state,session)` returns the current saved state unchanged, a closed session, original exposure, and `writes:0`. This is the common Esc/back/cancel path. It does not roll back concurrent edits by another owner. After Q2/external state changes, evaluation may show updated proposals, but confirmation of the old snapshot remains blocked until a fresh reviewed session is created.

`changeAllocationTopology(state,operation)` supports explicit `link`, `unlink`, `deleteLocation`, `deleteLine`, and `reorder`. It returns a new state and increments revision without persisting. Linked/manual quantities are preserved; only removed stable-ID relationships are deleted. Reordering changes presentation order without redistributing quantities. Callers remain responsible for the existing user confirmation UI before destructive operations.

## ONCE separation and remaining checks

`evaluateOnceAllocation({state,lineId,entries,confirmedFingerprint})` is separate. The sum at or above monthly usage requires the existing review confirmation, tied to an exact stable-ID/content fingerprint. It never applies the monthly hard cap to one-time deliveries. Changed input invalidates the prior confirmation. Mixed recurring/ONCE monthly ownership remains `POLICY_UNRESOLVED`; no unrelated mode is rewritten.

Run `node --test test/engine/allocation*.test.mjs`. Tests include independent exact expected values, draft/saved replacement, manual/derived distinctions, positive/zero/corrupt/editing quantities, total changes, two SKUs, 30-count each/tray conversion, topology/clone/reorder, cancel, stale source/draft, duplicate confirmation, and ONCE threshold. These are pure Node tests; real IME/autofill/cursor behavior, browser completion badges, external persistence, and Windows/iPhone acceptance require UI integration tests and are not claimed here.
