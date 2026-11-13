# MSG0581 provisional input reuse and storage boundary

Source: `ORDER-PARTIAL-20261112-063305-R1`; continuation of `WO-ORDER-20261101-ASTRA-ENGINE-001`. This is a reversible candidate and test contract. It does not authorize main publication, an authentication provider, a commercial offer, contact submission, or a confirmed schedule.

## Existing owners consumed by the candidate

| Concern | Existing owner / call | Candidate boundary |
| --- | --- | --- |
| Q1 actual selection | `web/app.mjs`: `pickGroup`, `render`, `upsertSku`, `beginAdditionalSku` | Reuse housing 1–4, approved egg sizes and 10/20/30 packaging. One existing line only. Do not invent a SKU for unknown specification. |
| Q2 actual input | `web/app.mjs`: `renderQ2` and quantity/unit/price listeners | Reuse the actual row and its numeric-input adapter; monthly input remains monthly. |
| Exact demand and price | `web/quantity-contract.mjs`: `validMonthlyQuantity`, `quantityUnit`, `baseQuantity`, `convertMonthlyUnit`, `currentPurchaseCost`, `totalPurchaseCost` | No new calculator. Display-unit conversion does not overwrite raw demand. Current approved package cost remains whole-package CEIL × package price. Missing price/package remains unavailable. |
| Numeric editing | `web/numeric-input.mjs`, `web/quantity-menu.mjs` | Existing grouping, IME, selection, undo, Arrow and focused-wheel behavior stays with the owner. |
| Region | `web/address-contract.mjs`: address `region`; `web/storage.mjs`: location region ≤1024 characters | Preserve raw region text, including district/dong. No standalone official region catalog exists. Raw simple region text is not provider-verified and is not a fabricated coverage code. |
| Detailed Q3 | `web/app.mjs`: `q3MountEditor`, `saveSite` | Full address/contact validators remain detailed-mode owners; simple Q3 does not call them to require new fields. |
| Calendar | `web/date-field.mjs`: `dateFieldMarkup({required:false})`, `bindDateField` | Reuse the actual common calendar and its draft callback. No separate calendar or date calculation. ONCE keeps `ONCE_LEGACY`; other modes keep D1R6 policy. |
| Modal lifecycle | `web/common-ui.mjs`: `OrderModalShell` | Existing open/close, focus, scroll lock and nested lifecycle remain authoritative. |
| Durable state | `web/storage.mjs`: `createBrowserStorage`, `projectStoredPayload` | Schema9 adds one optional strict envelope. Existing lock, revision/token, idempotent receipt, failure and reset contracts remain the single persistence mechanism. |
| Auth entry | `web/app.mjs`: existing `join-email` notice | No actual auth provider currently exists. Candidate request/return is an immutable research handoff, not sign-up success or business verification. |

Existing result groups are **구매 내역**, **납품지별 배정**, **납품 조건**, **비용 비교** in `invoiceDetails`. These are semantic owners, not authorization to replace accepted layouts.

## Exported contract

`web/simple-quote-contract.mjs` exports:

- `blankSimpleQuote()`: complete raw envelope with `version='provisional-0581-1'`, pinned `snapshotId`, unknown monthly scope, empty optional date, and consultation interest false.
- `projectSimpleQuote(value[,path])`: strict copy; rejects unknown fields, enum coercion, duplicate stable IDs and invalid civil dates. Inactive FLEX intent and date remain raw, unchanged by a mode switch.
- `inspectSimpleQuote(state)`: per-stage `{ready,issues}`, `readyToAdvance`, `proofBlocked`, `proofBlockers`, and independent UNKNOWN authentication/business-verification states.
- `projectSimpleInput(state)`: allowlisted one-line raw request snapshot. It excludes detailed locations, contacts, allocations, documents, DNS and transient UI state. It is not the approved quote API input.
- `createSimpleAuthHandoff(state,{requestId,inputRevision})`: minted immutable snapshot. The caller owns revision increments for each input change.
- `resumeSimpleAuthHandoff(handoff,{requestId,inputRevision,authentication})`: stale IDs/revisions fail; absent provider is UNAVAILABLE; cancel preserves input; an explicitly injected authenticated callback returns the same snapshot only. It performs no save, product unlock, account creation or business verification.

Authentication callback statuses are `UNKNOWN`, `UNAVAILABLE`, `CANCELLED`, `AUTHENTICATED`. A matching authenticated callback returns `status='RESUMED'`, which means the research snapshot can be handed back; it does not mean a production identity provider was tested. Forged or deserialized handoffs cannot impersonate a locally minted request.

## Readiness and unresolved policy

| Input | Advancement | Comparison/proof |
| --- | --- | --- |
| One complete existing Q1 product | Allowed | Still needs approved offer, verified coverage, monthly-scope decision and applicable costs. |
| Explicit unknown specification | Allowed with one line and positive monthly quantity | Always blocked; reversible existing picks may be retained but never treated as known. |
| Unknown packaging with each quantity | Allowed | No invented tray/pack, price or conversion. |
| Missing current price | Does not block basic form advancement | Cost comparison remains unavailable; never replace missing price with zero. |
| Shared region | Positive count and a nonblank raw region | Does not certify supplier coverage. |
| Per-site regions | Positive count, equal number of unique-ID region rows, every raw region nonblank | Same-city district/dong values remain distinct; no equal allocation. |
| FLEX | WEEK or MONTH raw intent required | Does not infer visits per week/month or convert quantity. |
| FIXED | Kind selection sufficient, date optional | “협의” remains a provisional interpretation, not a recurrence. |
| ONCE | Kind selection sufficient, date optional | No monthly recurrence or booked delivery inferred. |

The detailed engine treats Q2 as an SKU-level total for detailed allocations. That does not establish whether the new simple count/region form means all sites or per-site quantity. The candidate stores `monthlyScope='UNCONFIRMED'` and always blocks actual quote proof. Its proposed interpretation remains visible in the handoff report rather than being silently implemented as an operational policy.

## Persistence and isolation

The optional root `simpleQuote` fields are `version`, `snapshotId`, `specUnknown`, `consultationInterest`, `monthlyScope`, `siteCount`, `regionsDiffer`, `sharedRegion`, `sites:[{id,region}]`, `orderKind`, `flexBasis`, `preferredDate`. Existing product data stays in `state.lines` using its existing exact demand/unit/price contract. A simple envelope with more than one line is rejected.

Schema1–8 read byte-for-byte without a rewrite, injected simple fields, or meaning changes. Schema9 detailed data without the optional envelope stays identical in shape. Current writes use schema9. Historical test fixtures retain their original schema versions; only assertions for newly written current records were advanced.

Candidate boot must pass its own key and lock name plus `migrateLegacy:false` to `createBrowserStorage`. The shared detailed adapter keeps its default legacy behavior. The candidate does not read, import, delete or reset old detailed session records. Both modes retain one atomic native write, compare-and-swap revision/token checks, immutable queued writes, cancellation guards, duplicate receipts, and explicit failure/conflict returns.

## Independent verification

`test/engine/simple-storage-0581.test.mjs` covers fixed blank expected values, unknown-spec flow, unavailable-price proof, unchanged exact raw demand, enums/coercion/dates, district/dong identity, inactive-mode preservation, privacy projection, single-SKU enforcement, auth absence/cancel/stale/matching fixture, old schema reads, legacy namespace isolation, cancel0/confirm1/duplicate0, immediate adapter reload, concurrency/reset and write failure. These are injected-storage tests; they do not claim browser restart, user OS, actual auth, provider coverage or online price verification.

Per-worker checkpoint and actual command receipts are retained under `context/0581/storage-state` outside the repository. Parent integration owns the same-source browser tests, complete candidate CI and delivery manifest.

Q3 count editing keeps existing stable IDs and region text through empty/zero or a shorter positive typing prefix. Positive growth may append empty rows. Destructive shrink occurs only on explicit Arrow/wheel, blur, Enter or Q3-next completion; Q3-next awaits the same storage owner before progressing. The temporary count/list mismatch remains incomplete data, not an invented allocation.
