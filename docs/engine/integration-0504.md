# MSG0504 integration checkpoint

Existing WO-ORDER-20261101-ASTRA-ENGINE-001, repository `ydh1121/order`, branch `feat/order-astra-engine-20261101`.

The original four commits ending at `544b8ffada3f7b09f816d1fa5a3bbc78b97364d3` remain ancestors. The next engine is 0.2.0, additive contract 1.1.0. Existing quote API and PR #1 are preserved.

## Fixed intake and ownership

Latest received UX parent: Drive `1e6BuwKzqiVBu6F2VDzFqOpKeVtE58IUD`, 489401 bytes, SHA-256 `e13f200945b9277e986b1994fc4f91998fc68f18d1bcbc0b69cb8dc6dd54d6a8`. The old eab019/489172-byte comparison is historical. MSG0505 handoff received: file `1e-Ob5RvvbYXtJDyrWWLb3xRU_GP-h_o7`, 495479B, SHA256 `c02467f859829b438b3142435fe4698f335c42bae592d9f32255774ffe210e16`. Report `1P-nAAfv8Dp3JkuEr1fkrm-BPDBd6a6Ed` §4.1 explicitly froze the HTML and transferred integration ownership; Astra recorded its own receipt ACK in MSG0504. `web/` is extracted from that source, with separate common UI, contact adapter, allocation adapter, Q4 editor and page assembly.

`src/browser/engine.mjs` exports the independent browser entry. The phone adapter exposes the existing OrderPhone API; the email service owns field generations and domain request sharing; the allocation module accepts stable line/location IDs and exact explicit units. Their detailed contracts and examples are in `phone.md`, `browser-email.md` and `allocation.md`. Product contact fields, parent validity and commit gates now consume these modules; actual product Chromium results are recorded by CI separately from core tests. Unit changes preserve exact base quantities, including 50 each ↔ 5/3 tray, and retain raw/unit metadata.

## Build boundary

- `npm ci && npm test`: deterministic core and adapter tests. Synthetic observations are explicitly named.
- `npm run build:engine`: verifies static ESM dependencies with build-only Acorn, emits only the browser module closure and exact verified IANA projection into ignored `.build-engine/`. No product index or public QA page is created.
- `npm run build`: requires `config/pages-build.json` status INTEGRATED, a valid UX handoff SHA and an explicit frontend file/hash list. The received handoff and current integrated frontend hashes are pinned in this config. Missing/unverified handoffs still fail explicitly in build tests. It never falls back to PR #1 or old HTML.
- Final Pages settings are project order-ooo, main automatic production ON, preview None, build `npm run build`, output `dist`. The config expresses the requested state; it is not provider readback.

Frontend integration must use the received U1–U4 result, record its immutable source hash, then update the exact `web/` file allowlist and hashes after module extraction. Only imported source modules enter dist. Node adapters, tests, fixtures, reports, bundles and QA HTML are excluded. Build identity records Git SHA and actual reference/file hashes outside visible customer copy. No Worker, server or DB is needed.

## Reference maintenance

Owner: ASTRA_ENGINE_EXECUTION/repository maintainers. The prepared IANA workflow runs daily at 08:23 UTC on main, or by manual dispatch on main. It requires an integrated frontend, downloads the fixed official source with a bounded deadline/size, verifies integrity and freshness, runs tests and production build, then commits only the manifest and its verified content-addressed text file. It never force-pushes; a concurrent main change rejects the push. This workflow is not active until merged into the default branch and actually observed running.

GitHub-token pushes do not trigger another GitHub Actions workflow; required checks run inside the maintenance job before the data-only commit. The Cloudflare Git integration still requires actual provider verification and source-SHA-to-deployment readback before claiming that daily refresh reaches the canonical root. Scheduling can be delayed or disabled on inactive public repositories; review failed runs and use `npm run update:iana`, tests, build and the normal reviewed push path as recovery. Do not fake a newer collection time or bypass stale-reference UNKNOWN.

Open tabs retrieve the fixed same-origin reference asset without cache. Failed/stale refresh retains user inputs and the previous snapshot with original timestamps while completion remains uncertain. No input is cleared merely because seven days elapsed.

## Remaining gates

Local integration and build checks are implemented. Remote product transactions and computed styles, canonical HTTPS, Windows/iPhone, provider configuration, main merge and canonical deployment require their own actual evidence. CI records Linux Chromium synthetic product transactions separately from live external-origin DNS observations. Temporary transport files are absent from the current tree; original four Astra commits remain ancestors. USER_APPROVED_LOWFI remains NONE and G11 remains FAIL_USER_REWORK. Prices/DB/payments/orders remain unapproved. Address QA is not imported.

## Removed public QA paths

Synthetic price scenarios, the 6600/7200 sample offers and mutable low-fi injection globals were removed. Product build emits no fixture, comparison lab, QA HTML, evidence ZIP or alternate entry. Same-origin IANA and explicit module imports are verified against the output inventory. External test runners intercept DNS or seed synthetic storage outside product code. Current purchase amounts use exact arithmetic from user-entered quantities and prices; actual supplier prices remain unavailable. Calendar forecasts no longer assume four weeks: absent schedule/holiday policy stays unresolved without blocking monthly allocation.
