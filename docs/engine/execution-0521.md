# MSG0521 implementation and evidence contract

Scope: WO-ORDER-20261101-ASTRA-ENGINE-001, repository `ydh1121/order`, existing branch `feat/order-astra-engine-20261101`, base `b9d825a144ac04e30bb136aaa7a2ccbdb2f34a4b`. This document describes implementation, not user acceptance. Final Git/CI/deployment and observed R01–R24 results belong to the execution report and official QA D/G cells.

## Shared owners

| Owner | Consumers and contract |
| --- | --- |
| `web/common-ui.mjs` / `OrderModalShell` | Q1, Q3, Q4, address and contact-copy editors use `bind(editable,isDirty,onExitIntent)`, `requestClose`, `open(history:true)`, common discard confirmation, resize and scroll lock. Saved/invalidated cleanup uses `close`; user exit never bypasses the guard. |
| `web/numeric-input.mjs` | Q2 quantity/price, Q4 monthly/per-delivery/min/max/ONCE/date fields; whole invalid input rejection, composition, selection, paste/drop and undo. Phone/postal excluded. |
| `web/styles.css` | Existing tokens own input type, compact confirmation gaps, action footer, close target, contact comparison rail, Q4 state priority and address trigger. No new approximate colors or per-string offsets. |
| `web/quantity-contract.mjs`, engine allocation/period | Exact source demand M, independently known site demand D, integer package plan P and provenance; display conversions never mutate M. |
| `web/allocation-ui.mjs`, `web/q4-planning.mjs`, `web/q4-review.mjs` | Package-only delivery units; single remaining allocation proposal; ONCE exclusion; FLEX frequency and FIXED nominal calendar/reverse suggestions; manual input preserved. |
| `web/storage.mjs` | Strict schema4 projection, legacy migration, export/import, revisioned single writer and tombstone. No durable DNS PASS. |
| DNS/IANA adapters, `web/contact-ui.mjs` | Domain-only bounded independent provider observations; current TTL0 transaction proof separate from reusable TTL cache. |
| `web/app.mjs` | Exact editor identity/revision/fingerprint checks, one parent save, transactional final proof map, no global promotion of TTL0 or UNKNOWN. |

## Transactions and demand

Backdrop pointer gestures do not dismiss editable dialogs. Dirty explicit exit cancels any pending save attempt before opening the common decision dialog. Continue retains the editable raw draft. Discard changes no committed payload. Child address confirmation patches only the parent address fields; only parent Save persists. Conflicts do not merge or overwrite another tab automatically.

For M=5,000 each, package size30, A manual plan50 and B missing: A's plan share is1,500 each but is not invented observed demand. B's residual demand is3,500 each and its package proposal117. Total plan167 and surplus10 do not rewrite M to5,010. Known D=2,500 each at each of two sites yields84+84 packages; the global ceil(M/30)=167 is not an absolute cap. Manual package edits never overwrite independently known D.

ONCE is excluded from repeated monthly eligibility, sums, residuals, proposals, limits and completion. All-ONCE is not applicable and leaves Q2 intact. Prior inactive-mode values remain separate. Existing ONCE quantity confirmation remains its own policy.

FLEX shows average expected order frequency, not a confirmed delivery count. FIXED proposals distinguish reference month, pattern start week and actual weekdays from nominal counts. Per-week-v1 patterns are not reinterpreted as alternate-week delivery. No four-week/30-day conversion, holiday policy or excess percentage is invented. Variable integer distributions require the user's variable setting and valid limits.

## Email evidence and future operations

CNAME plus an applicable SOA negative response can establish NODATA; incomplete chains, referrals and conflicting providers remain UNKNOWN. TTL0 can establish the current unchanged input/action only; it is not a reusable cache lease or persisted validity. Final result navigation carries a per-site proof map through the unchanged state/revision gate and destroys that transaction afterward. Editing/cancel/reopen/restore must acquire applicable new evidence.

The existing IANA maintenance workflow remains the single scheduled owner. Workflow presence, local updater execution, actual Actions execution, data age/hash and deployed reference are distinct observations. Stale/missing/failed reference is neutral uncertainty, not an invalid user domain.

`emailDomainDiagnostic()` is reusable for the already registered future P26 administrator task: canonical domain, reason codes, provider observations/conflict, observed/expiry times, versions and reference hash. It does not prove mailbox ownership or message receipt. This scope adds no administrator UI, global allowlist, account roles, permanent exception or SMTP probe. Future overrides require scope, accountable owner, reason, expiry, revocation and audit.

## External limits and evidence

Address failures preserve the input and distinguish NOT_CONFIGURED, provider HTTP/rejection, timeout, network and malformed response. A provider rejection may expose only a bounded `Edddd` diagnostic code; no provider text, key or query is echoed. Customer UI uses short generic failure text. Dashboard access and actual same-origin provider success must be reported separately; failure alone does not establish a missing key. See [existing-project setup](../address-provider.md).

Preview None requires saving and rereading the existing project's setting. `[CF-Pages-Skip]` on feature commits only prevents unintended branch publication while that setting is unresolved; it is not proof of the setting. The main merge message must permit the authorized canonical production deployment. Public dist excludes QA/LAB/fixtures/reports/keys.

R01–R24 evidence must identify the same final source and distinguish Node mocks, Chromium fixtures, actual HTTPS/DNS/provider observations, real profile restart, new context, user OS and user acceptance. Preserve the earlier profile-relaunch timeout and retry success; its initial cause remains unknown. Reset location A/B/C remains undecided and is not moved. LOWFI=NONE / G11=FAIL_USER_REWORK / P26=IN_REVIEW.
