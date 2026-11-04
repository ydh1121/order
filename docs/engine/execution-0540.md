# MSG0540 approved QA integration

Existing work order: WO-ORDER-20261101-ASTRA-ENGINE-001. Source base: `14ee100a692caa229be446c405a9d0bb9d295479`, retaining PR10 and subsequent IANA updates. The nine QA groups are user-approved within scope; this document records implementation contracts, not a new approval or a claim that provider/OS/production tests passed.

## Owners and contracts

| Area | Shared owner | Current contract |
|---|---|---|
| Q1/Q2 and actual checkpoint | `web/app.mjs`, `quantity-contract.mjs`, `quantity-menu.mjs` | Literal +; custom unit menu; ceil(raw each / package size) × package price; one durable receipt owner |
| Numeric editing | `web/numeric-input.mjs` | Grouped display / canonical digits; 12 digits; IME/paste/drop rejection; Arrow/wheel intent; no identifier coercion |
| Form, modal, comparison | `web/styles.css`, `web/common-ui.mjs` | Approved A23/G2/N1/R1/C1R/M2R; nested shell/focus/scroll ownership |
| Q4 calculation and form | `web/approved-schedule.mjs`, `q4-planning.mjs`, `q4-review.mjs` | Independent M/Q; exact arithmetic; explicit cadence transaction; maximum weekday count with selection order |
| Dates | `web/order-date.mjs`, `date-field.mjs`, `date-field.css` | D1R6 single date row and 304px common calendar; clock injection; existing official holiday snapshot |
| Persistence and final gate | `web/storage.mjs`, `cadence-contract.mjs`, `OrderRepeatContract` | Schema7 / cadence3; legacy meaning retained; same committed model used for restore and completion |
| Address | `functions/api/address/search.js`, `web/address-*.mjs` | Same-origin Kakao REST, provider-qualified identity, server-only secret; child0 / parent1 writes |

## Quantity changes

Q2 prices are per tray/pack regardless of the display unit. A raw demand of31 eggs in30-egg packaging at10,000 won per package costs20,000 won. Selecting another display unit does not rewrite31 to60. The each-mode step is the package size; the package-mode step is1. Monetary sums retain exact arithmetic before formatting. There are no actual supplier price literals.

FLEX and FIXED share a SKU's monthly allocation; ONCE is excluded. Raw demand, known site demand and integer package plans remain separate. The84+84 packages for two known2,500-egg demands must not be rejected by an unrelated global167-package ceiling.

On an accepted FIXED M/Q edit, M=Q selects monthly, 12≤M/Q≤22 weekly, 1.5≤M/Q≤2.5 fortnightly, and other valid values consultation. A monthly edit never rewrites Q. A direct Q>M edit clamps Q once. Explicit monthly selection remembers the prior non-monthly quantity; leaving monthly restores it only through an accepted option. Manual ranges are never silently rewritten.

Weekly frequency uses M×7/(Q×days in the actual editing month), not four weeks. Fewer than the maximum N preferred weekdays are valid; excess weekdays preserve selection order and block confirmation without deleting choices. Consultation is an explicit persisted choice.

## D1R6 date replacement

The approved date UI is one editable year/month/day row and the common calendar, not the R7 candidate cards or a two-delivery visualization. Seoul current year/month are defaults with an empty day. Immediate normalization preserves valid multi-digit prefixes. The current start range is today through the next month's last day. No blanket weekend/public-holiday prohibition or three-business-day preparation delay is introduced into this contract.

Weekly and fortnightly require a start date. Consultation hides it. Monthly derives the read-only first date from the original numeric dayRule or `last`; the original rule survives February/month-end projection. A monthly date has no editable calendar trigger. Existing ONCE policy is not silently replaced.

The basic notice appears only before selection. Selected-context notices use the existing official2026/2027 holiday snapshot and approved text; unknown-year coverage stays explicit. No production supplier-unavailable fixture is supplied. These estimates do not place orders.

## Storage and provider boundaries

Legacy per-week/cadence2 values are retained as legacy, never reinterpreted as an approved cadence just by reading. Schema7 persists consultation, frequency, weekday selection order, monthly restoration memory and provider-qualified address data. The durable adapter still serializes writes and returns failure/conflict rather than false success. Popup drafts remain private until confirmation.

S2R renders only actual pending and successful receipts. Its return-to-idle presentation timing is not a fake save. Failed, conflicted or invalidated attempts cannot display success.

The address route allows only the fixed official Kakao host and bounded query/page/results/timeout/response. `KAKAO_REST_API_KEY` exists only in server binding/header. A Kakao selection identity is a locally computed provider-qualified hash, not a claimed provider-issued building identifier. Existing JUSO addresses retain their provenance.

## Validation and publication

Run `npm test`, `npm run test:engine`, `npm run build`, and `node test/browser/msg0540.smoke.mjs` on a Chrome-enabled host. Existing meaningful regression checks remain in CI, with individually superseded assertions identified. Browser tests separate synthetic DNS/address transport from real provider observations.

CI does not automatically query the canonical address endpoint: MSG0540 reserves one representative real query for the execution owner after the final deployment. No credentials, fixture HTML, reports or local LAB enter product `dist`. `npm run build:qa-lab` bundles the same committed modules and linked CSS into one isolated offline HTML.

Release evidence must link actual feature/main SHA, parent/tree, PR, same-SHA CI, Pages deployment identifier and exact canonical root build identity. Preview None requires an authenticated provider setting readback; a CF-Pages-Skip feature prefix is only a temporary preview safeguard. Historical503, user OS flash and storage timeout causes are not automatically resolved by this change.

QA C54-01–24 execution results belong in the owner's D/G columns. MASTER H and counterpart ACK are not changed. LOWFI=NONE and P26=IN_REVIEW remain. UI approval, local/synthetic checks, canonical publication and commercial acceptance are distinct.
