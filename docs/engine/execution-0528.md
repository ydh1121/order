# MSG0528 implementation contract

WO-ORDER-20261101-ASTRA-ENGINE-001 continues from main `a1cdfb61a4b908a0ae93ee32d03e8f657623e182` / tree `2b043c07edaeeb9f842b008e5c3ce1b6f312f6e5`. Prior MSG0526 execution remains history. Only superseded requirements change. The only canonical development site is `https://order-ooo.pages.dev/`.

The 64,410-byte handoff SHA-256 is `b7ca1345a94e85e43cef9eb0e6c9b063d7da13071720abb0689bca34c7a03b80`. The separately preserved 13,749-byte user original SHA-256 is `55ecc577cf79ba56dc7449be65b3481be51c75cc4e19368569f405dd0f9dbc3b`. The original appears once, byte-for-byte, in the handoff appendix. Source typos, duplicate numbering, and calendar examples are not rewritten in those records.

## Requirement and common owner map

| QA | Behavior | Shared source / consumer |
|---|---|---|
| C28-01 | Egg-only numeric variant; other field appearance uses 6768f95 rules | `web/styles.css` / explicit `.ui-egg-field` and `.ui-egg-number` consumers |
| C28-02 | Compact grouped display; canonical integer model; step/IME/caret/Undo | `web/numeric-input.mjs` / `app.mjs`, `q4-review.mjs` |
| C28-03 | Body checkpoint preserves incomplete state; private popup excluded | `app.mjs` bodyCheckpoint/save / `storage.mjs` schema6 |
| C28-04 | Reset below CTA; eraser; shared action gap and neutral hover | `common-ui.mjs` OrderIcons / `styles.css` |
| C28-05 | New SKU cancels immediately; existing dirty protection retained | `app.mjs` SKU binding / OrderModalShell |
| C28-06 | Q2 copy and exact demand/cost; remove secondary add path | `quantity-contract.mjs` / `app.mjs`, `index.html` |
| C28-07 | New-site discard copy; site-delete confirm width | OrderModalShell discardCopy / app site bindings |
| C28-08 | Contact copy editor width; merged selectable values; scroll | OrderCopyDialog contact presentation / app stable targets |
| C28-09 | Accessible comparison without visible before/after labels | OrderCopyDialog renderReview / app final transaction |
| C28-10 | Item actions use existing management widths/gap | shared `.code1-text-actions` owner |
| C28-11 | Link/link-off assignment; confirm role; parent draft selection | OrderIcons / app Q4 assignment transaction |
| C28-12 | Scoped order labels; inline min/max; neutral outputs; direct weekdays | `q4-review.mjs` / common fields |
| C28-13 | FLEX/FIXED share SKU monthly budget; ONCE excluded | `allocation.mjs`, `allocation-ui.mjs` |
| C28-14 | Derived remainder recalculation; manual values and package exception | allocation editor / quantity contract |
| C28-15 | Direct upper bound; complete FLEX lower bound; Undo preserved | `period.mjs` orderQuantityInput / Q4 consumer |
| C28-16 | Exact representative M/Q, approximate/daily distinction | demandFrequency / frequencyPresentation |
| C28-17 | Direct FIXED overflow changes only edited site's draft cadence | Q4 applyQuantityInput/materializeCommonSettings |
| C28-18 | Optional first delivery estimate; old year window superseded | `cadence-contract.mjs` / Q4 date owner |
| C28-19 | Three preparation business days and next-month upper bound | `start-date.mjs` startDateRange |
| C28-20 | Official dates, scoped snapshot, unknown-year failure | `kr-holidays.mjs` / holidaySnapshotState |
| C28-21 | Partial date input neutral; complete correction and one message | inspectStartDate / datePresentation |
| C28-22 | Nominal 31/last and 14/21 anchor retained through shifting | cadence2.1 / recurringDeliveryDates |
| C28-23 | Scoped year-end/holiday/route restrictions; warning versus block | start-date policy inputs; no invented operating restriction |
| C28-24 | Seoul midnight recheck; unstarted drafts; started/legacy anchor preservation | Q4 fixed editing date / start-date lifecycle |
| C28-25 | Shared modal roles, nested motion, focus and scroll lifetime | OrderModalShell / existing common shell |
| C28-26 | Write failure, immediate reload, tabs, reset and late response | central storage / product transaction and browser tests |
| C28-27 | No routine internal copy; conditional date copy; same-source LAB | shared datePresentation / build-qa-lab module graph |
| C28-28 | Same-main CI, deployment/root identity, original and artifact custody | external report, own QA/Bus/CURRENT and raw download hashes |

## Interpretation and corrections

| Source wording or ambiguity | Applied contract | Boundary |
|---|---|---|
| 600/30=20 described as maximum | FLEX minimum is ceil(M/D); maximum M | Arithmetic correction, not an added delivery policy |
| 610/29 with 28–30 variable range | Representative exact M/Q; display approximately21 | Planning interpretation; min/max alone can leave representative unchanged |
| December4 application; January31 upper limit | December10 minimum; January29,2027 last eligible day | January31 is Sunday |
| December23 application implies December31 or January4 | Preparation24/28/29; minimumDecember30 | January4 requires explicit new-start restriction December30–31 |
| End-of-year congestion | Versioned warningOnly or scoped operating restriction | No invented nationwide closure or percentage |
| 1st/3rd popup size | Explicit editor29rem / confirm22rem roles | Not DOM nesting depth |
| Saved date means started | Preserve explicit STARTED and unchanged old past LEGACY anchor | No inference of actual commercial operation |

## Persistence and exactness

`save()` remains the only product commit coordinator. It serializes writes through the existing Web Locks adapter, revision/token checks, transaction receipt and reset epoch. A body checkpoint captures only the body state plus an initial inline Q1 selection. Confirmation candidates remain private until their existing transaction succeeds. Successful duplicate checkpoint receipts are revalidated under the same storage lock with the original payload/revision; an intervening tab write/reset causes conflict. Uncertain-write retry reports the actual reused transaction ID.

Storage schema6 validates the new checkpoint and date metadata without weakening older schemas. cadence2.1 stores `nominalAnchor` independently from `preferredDate`; 2.0 and old per-week patterns retain their meaning when read. Q2 raw demand, known business demand, integer package plan and actual per-order quantity remain separate. Quantity display formatting never supplies numeric model values. Exact monetary values are summed before final display rounding.

## Verification boundaries

`test/engine/rework-0528-quantity.test.mjs` contains independent N01–N16 expected values. `test/engine/start-date-0528.test.mjs` covers D01–D30. `q4-ui-0528.test.mjs` executes actual extracted adapter functions; `product-gate-review.test.mjs` executes the actual save coordinator with controlled locks/storage. These are not online, visual or OS claims.

`test/browser/q1-q4-0528.smoke.mjs` uses the built product, explicit synthetic contacts/DNS/address inputs, matched before/after fixtures, five representative widths and full-viewport modal frames. The local comparison LAB embeds each fixed Git module/CSS graph and isolates its memory data; its synthetic network substitutes are declared in identity metadata and excluded from product dist.

Final execution evidence records actual commands, current counts, first failures and fixes, same-SHA CI, remote main, production deployment ID and canonical root identity. Existing failed profile-relaunch timeout, actual address503, multiple-domain email reports, Preview None, user OS flash and pre-commit immediate reload remain separate limitations unless directly retested and proved.

`USER_APPROVED_LOWFI=NONE`, `G11=FAIL_USER_REWORK`, `P26=IN_REVIEW` remain unchanged. No commercial price, order, payment, account or database approval is implied.
