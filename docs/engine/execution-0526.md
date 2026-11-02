# MSG0526 canonical Q4 and shared inputs

This work continues WO-ORDER-20261101-ASTRA-ENGINE-001 on the existing product. The rejected Q4 QA12 alternatives remain historical evidence and supply no product formula or acceptance. The baseline is main `6768f95e759652bdaadbd15fab406e0deebf0393`, whose product UI descends from `f37eeda`.

The original instruction is 26,846 bytes, SHA-256 `5dc99e3a2ba5095d7c64fb13836ed1b31f23f051a598bda85adeba6f009c6978`. The source and user image were read and their exact hashes verified before the own-message ACK. Official QA is `Q1_Q4_INTEGRATION_0504` C26-01–20; execution updates only D/G.

## Owners and behavior

| Owner | Contract and consumers |
| --- | --- |
| `web/common-ui.mjs` OrderModalShell | Native backdrop, role width, scroll lock, focus/history, motion completion and nested edit/discard transactions. No extra shade overlay or timeout closes. |
| `web/styles.css` common input and confirmation rules | Q2 numeric field and Q3/Q4 consumers share underline, control height, focus/error, field-title spacing and semantic widths. Confirm/selection/editor widths remain distinct. |
| `web/numeric-input.mjs` | Exact integer keyboard steps; wheel requires both focus and pointer inside. Readonly, identifiers, composing and modified gestures are excluded. Unchanged bounds emit no edit. |
| `web/cadence-contract.mjs` and OrderRepeatContract | Explicit cadence version 2.0.0 distinguishes weekly, 14/21-day intervals and monthly dayRule from legacy per-week-v1 patterns. Optional preferred date uses Seoul bounds at edit time. |
| `web/q4-review.mjs` | Single, individual and bulk forms consume the same cadence/date/quantity contracts. FLEX closes its policy scope to regular closures and requests; FIXED retains holiday response. |
| `web/storage.mjs` | Schema5 strictly validates cadence and preserves schema1–4 values. Loading does not rewrite legacy patterns or initiate orders. Inactive unfinished draft metadata does not become an active requirement. |
| `src/engine/calculation` and `web/allocation-ui.mjs` | Exact demand and package capacity remain separate. Canonical package slack is not a second demand excess. Manual/derived/retyped plans have equal verdicts. |

FLEX frequency retains exact ratios internally. Variable ranges use max(1, floor(M/max)) to max(lower, ceil(M/min)); fixed quantities use HALF_UP to an integer, minimum one. Display values never become prices or confirmed delivery counts. No four-week or 30-day policy is introduced by this form change.

Monthly dayRule 31 and last remain distinct. Choosing a dayRule does not select an optional first date. Once explicitly selected, the first date and dayRule synchronize; month/year clamping preserves the recurring rule. An unchanged historical anchor remains valid as time advances. ONCE keeps its prior date and confirmation policy.

Removed process/reference/count/proposal inputs are not active completion requirements. Stored manual quantities and old auto/contact values remain intact. A new cadence is written only by an explicit user choice; old 2/3/4-week patterns are never reinterpreted as 14/21-day intervals on load.

## Verification and limits

Run `npm test`, `npm run build`, and the Chromium workflows. `test/browser/canonical-q4-0526.smoke.mjs` compares the exact baseline with the new source at 320/375/390/768/1440 and records full viewport motion frames, numeric/date cases and storage transactions. The single offline comparison is built with `node scripts/build-qa-comparison.mjs --baseline <baseline-checkout> --out <local-output.html>`. Both product graphs and comparison-builder identity are recorded separately. Synthetic fixtures, reports and comparison output are excluded from dist.

Local contract checks, CI Chromium, canonical HTTPS, live providers, user OS and user acceptance are separate evidence scopes. Final counts and immutable SHA/CI/deployment links belong to the execution report, not to historical totals copied into this document. The prior profile-relaunch timeout cause remains unconfirmed.

Production remains the existing `order-ooo` Pages root. Preview None must be saved and reread in provider settings; a CF-Pages-Skip feature prefix is only a temporary defense. The final main merge uses a non-skip message. No new preview, public QA path, server/DB, IA portal or commercial order authorization is created. LOWFI=NONE, G11=FAIL_USER_REWORK, P26=IN_REVIEW remain.
