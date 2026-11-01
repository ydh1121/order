# MSG0521 quantity and package contract

This extends the existing monthly allocation transaction engine. Q2 is still the
authoritative monthly source. Its exact base amount is **M**. An explicitly known
site amount is **D**; the editable Q4 integer package plan is **P**. Changing P does
not overwrite known D. A manually assigned P can contribute `P × packageSize` as
a planning share; that share is never recorded as observed consumption.

## Pure allocation input and output

Opt in with `line.monthlyPlanning = {version:'2.0.0', unit:'tray'|'pack'}`. Package
factors come from the existing versioned unit table. An allocation contains:

```js
{
  lineId, locationId,
  quantity: {raw:'117', unit:'tray'}, // P, positive integer
  source:'derived',                 // P source: manual | derived
  demand:{raw:'3500', unit:'each'},  // D, or null when unknown
  demandOrigin:'residual',          // known | residual | single-total | package-plan | unknown
  demandSource:'derived',           // D source: manual | derived
  mode:'FLEX'                       // FLEX | FIXED | ONCE
}
```

The existing begin/edit/confirm/cancel calls retain their stale-snapshot and
duplicate-transaction protections. `setMode` updates only the selected draft row.
`refreshDerived` may update a derived proposal; it does not edit manual P or known
D. ONCE rows retain dormant data but are excluded from recurring calculations.
All ONCE returns `normalized.notApplicable:true`, with Q2 untouched.
When exactly one recurring site has no independently known demand, M determines
its whole D. Manually retyping P167 for M5000 retains inferred D5000 and10 package
slack. With several unknown sites, manual package shares remain planning shares;
the engine does not invent a per-site consumption split or tolerance percentage.
The sole-site inference has `single-total` provenance. Adding another recurring
site invalidates that D: a manual P remains a planning share; a derived P is
recomputed only in the explicit draft. Known D is unaffected. ONCE dormant values
stay unchanged until their mode becomes recurring again.

Results separate `totalBase`, `knownDemandSum`, `totalPlanPacks` (global ceiling),
`planSumPacks`, `displayTotalPacks`, `packSlackBase`, `rawResidualBase`, and
`excessBase`. Each site includes `demandBase`, `allocationShareBase`, `planPacks`,
and package slack. `currentMaximumPacks` is a replacement comparison; it is not
applied as a global hard cap to known site demand. Pending/invalid quantities
yield null arithmetic fields. Unknown consumption is not filled by proportional
reverse allocation.

Independent expectations:

| Source | Result |
| --- | --- |
| M5000 each, A50 packages, B empty, size30 | B D3500/P117; sum P167; package slack10; M5000 |
| known D2500 at each of two sites | P84 + P84 =168; global ceiling167 is not a cap |
| known D2500/P84, manually change P85 | D2500 unchanged; P85 manual |
| two unfilled sites | one total residual, no hidden equal split |
| ONCE plus FLEX | only FLEX consumes the recurring monthly source |

## Delivery support

`demandFrequency({monthlyPlan, quantity, range?})` returns exact rational average
`P/q` and optional range `P/max..P/min`. It is a long-run average, not an actual
monthly visit count. The browser formats it only after calculation.

`fixedQuantityPlan({monthlyPlan, visits, variable, range?})` uses an explicit
visit count. P167/N8 requires variable permission and a range allowing20–21 to
propose 21 packages seven times plus20 once. It never applies the proposal or
invents a calendar conversion. Existing `calendarForecast` supplies actual
nominal dates with explicit reference month, recurrence, anchor and policy.

## Durable schema4

Historical `monthlyDemandQty/Unit/Source/Exact` keep their demand meaning. The new
strict fields are `monthlyPlanQty`, `monthlyPlanUnit`, `monthlyPlanSource`,
`monthlyDemandBasis`, and `monthlyAllocationContract:'2.0.0'`. Known/residual demand
is exact `each`; unknown/package-plan demand remains empty. A reviewed historical
rational is validated before conversion and never exposed as editable fraction
syntax. Metadata conflicts remain invalid.

Optional nominal context is `planningReference:{year,month,anchorDate,nominal}`
and `nominalVisitCount`. An explicitly accepted `deliveryPlan` stores its version,
P, visits, integer distribution, range, reference, source and review flag. The
optional `inputSignature` binds acceptance to the exact source planning context.
storage projection checks totals, positive integer packages, allowed fields and
matching SKU package units. Schema1/2/3 reads retain original bytes and semantics;
only a successful current commit writes schema4. JSON export/import uses the
same strict projection. Storage failure, revision conflict and reset protections
remain unchanged.

Q2 display uses CEIL for packages and DOWN to one decimal only for its opposite
unit note. Cost remains exact until final HALF_UP currency display. No displayed
rounding feeds back into M, D or P.

## Evidence scope

`test/engine/rework-0521-quantity.test.mjs` supplies independent literal
expectations for R11–R19 quantity behavior. `rework-0521-storage.test.mjs` covers
R23 source preservation, projection/import, version rejection, failed write,
concurrent tab transactions, duplicate receipt and reset. These are isolated
Node tests using synthetic storage; actual HTTPS, OS, UI geometry and user
acceptance are separate evidence.
