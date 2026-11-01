# MSG0504 — Pages deployment and browser reference boundary

Scope: CODE1/order.ooo, WO-ORDER-20261101-ASTRA-ENGINE-001. This is an infrastructure review and implementation contract, not evidence that a provider setting, remote commit, deployment or browser acceptance has happened. Inspected baseline: local `544b8ffada3f7b09f816d1fa5a3bbc78b97364d3` on `feat/order-astra-engine-20261101`. Provider/account access belongs to the parent executor; this review performed none.

Current build correction under [MSG0510](https://drive.google.com/file/d/1h-lV2neyfAjZM0p8J7SA5rsRlZcc3hEm/view): `package.json` defines `npm run build` as `node scripts/build-pages.mjs`, and `config/pages-build.json` names `dist` as its output. The provider values below are requested configuration, not saved-setting readback. The historical baseline audit later in this document describes `544b8ff`; it does not describe the current integrated build.

## Required provider configuration

| Setting | Required value | Evidence needed after setting |
|---|---|---|
| Product and project | Existing Cloudflare **Pages** project `order-ooo`; create exactly that name only if absent | Project metadata and exact production hostname |
| Git source | `ydh1121/order` | Connected repository readback |
| Production branch | `main` | Saved branch configuration |
| Automatic production deployment | Enabled | Saved `production_deployments_enabled: true` or equivalent dashboard state |
| Automatic preview branches | **None** | Saved `preview_deployment_setting: none` or equivalent dashboard state |
| Public review entry | `https://order-ooo.pages.dev/` | Root HTTP/browser readback |
| Functions/Worker/server/DB | None needed for the static browser engine | No `/functions` integration, `_worker.js`, bindings or separate Worker deployment |
| Framework preset | `None` | Saved framework setting |
| Build command | `npm run build` | Saved build command and the matching source commit's build log |
| Build output | `dist`, containing only the explicit output inventory | Saved output setting plus artifact inventory |
| Root directory (advanced) | Leave blank; use the repository root | Saved root setting |
| Environment variables (advanced) | `NODE_VERSION` = `22` | Saved variable and build runtime readback |

Under MSG0510 the user creates or connects the exact Pages project through their working browser session; the executor then verifies it. Actual provider settings, production deployment ID and canonical product root acceptance remain **NOT_VERIFIED** until read back. A successful repository build does not supply that evidence. This static build does not require an additional application API key or D1 configuration. `CF_PAGES_COMMIT_SHA` is supplied by Pages during its build and is not a value the user must enter manually.

Cloudflare's official [branch controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/) permit a production branch with automatic deployment enabled and preview setting None independently. Defaults deploy preview branches, so None must be explicitly saved. A Git-connected Pages project uses its project name for its hostname; do not replace the requested Pages root with a `workers.dev` URL. See [Git setup](https://developers.cloudflare.com/pages/get-started/git-integration/) and [static HTML](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/).

Preview None disables automatic preview builds; it does not delete any historical preview deployment or suppress the platform's immutable production deployment identity. Do not make an alternate project/site for review. The executor must distinguish that setting from zero historical aliases.

## Baseline audit and minimum build

At the inspected baseline, package scripts include engine tests/example/DNS smoke/IANA update but **no frontend build**. Engine CI runs on the Astra branch and PRs targeting main, with Node 22 and 24. It has no `push: main` trigger, public build verification, or browser job yet. `scripts/serve.mjs` is a localhost development server and is not a Pages build. No Pages, Wrangler, Render or production build configuration was found in the tracked working tree. That absence is not proof that an external Git integration is absent.

Use a deterministic local build with an explicit allowlist, not a repository-root deployment or recursive copy of all `src/`:

| Include in public output | Exclude from public output |
|---|---|
| One integrated product `index.html`, derived from the exact UX handoff hash | Earlier HTML candidates, comparison labs, address QA and alternate entry pages |
| Product CSS/assets and the browser-import dependency closure | `test/`, all synthetic fixtures, scripts, reports, logs, patches, bundles and ZIPs |
| Pure contracts/validation/calculation modules actually imported by the frontend | Node DNS adapter, Node IANA loader, `node:*`, `Buffer`, build-only dependencies |
| Browser DNS/IDNA/reference adapters | Credentials, private contacts, price evidence, provider/account identifiers |
| Verified IANA public reference projection | Test offers or demonstration price tables |
| Minimal `_headers` and an appropriate static 404 page if routing permits | `/functions`, `_worker.js`, unrelated Workers/DB bindings |
| Non-UI build identity JSON and asset manifest | Source maps unless separately inspected and intentionally included |

The existing real `data/offers.json` is empty. If needed by the final frontend, copy only that verified provider payload; do not fill it with fixtures. A missing real price stays unavailable.

Build must fail on an unexpected output path, unresolved relative import, non-browser import, missing entry point or unverified reference bytes. Audit the actual emitted file list and hashes. `git ls-files` alone does not establish the output inventory. A permissive static-host fallback may return product HTML for absent test paths; assess content and emitted files, not only HTTP status.

Add the final build/output checks to the existing test CI and run them for relevant main pushes. A fresh production build must return nonzero on a failed required check; Cloudflare deploys when the build exits zero. Do not add a deployment token to this static test workflow. The Git integration owns deployment. See [build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).

## Browser DNS contract

Cloudflare documents `https://cloudflare-dns.com/dns-query`, GET JSON queries and `Accept: application/dns-json`; no API authentication is required ([request API](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/)). DNS JSON is provider-defined rather than an IETF JSON standard ([JSON schema](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)). Pin the adapter schema and endpoint rather than trusting arbitrary resolver URLs.

Send only the normalized domain or MX host and RR type. Do not send the email local-part, form contents, account identifiers or credentials. Use an explicit no-referrer policy and omit credentials. HTTP failure/CORS failure/timeout/aborted body/schema mismatch is uncertainty; DNS NXDOMAIN comes from the validated DNS response status, not HTTP 404. Validate question name/type, answer owner or bounded CNAME chain, RR type, truncation flag, record data and TTL. Reject unrelated answers; never let an unrelated A record prove the mail route. Unknown negative TTL must not be cached as a known lifetime.

The ordinary core query/time budgets still apply across retries and aliases. Concurrent consumers may share one identical domain/type request, but one consumer's cancellation must not abort another active consumer. Late responses may populate a valid shared DNS cache; they must not write into canceled or changed UI drafts. Final completion requires current validation and the existing neutral/blocking UNKNOWN gate.

Official API documentation is not evidence that fetch/CORS works from the actual Pages origin. Verify `https://order-ooo.pages.dev/` with actual browser traffic, response headers, console errors, cancellation and independent unknown/failure cases. Curl/Node success and browser success remain separate evidence classes. No proxy Worker is implied if browser access fails.

## IANA maintenance and aging

The existing exact-byte IANA manifest, hash and updater remain authoritative build inputs. The browser agent's selected design emits verified data at same-origin `/assets/iana-reference.json`; runtime code verifies bytes/metadata using WebCrypto and retains prior data on failed refresh. Build rejects stale source by default. An optional explicit build refresh may use the existing official-source updater. Actual implementation tests and online readback are still required; this document does not promote the design to PASS.

The seven-day reference freshness ceiling must not silently become a permanent site expiry. Assign maintenance to ASTRA_ENGINE_EXECUTION/repository maintainers. Proposed operation: default-branch daily freshness workflow, away from minute zero, runs the bounded official updater, integrity checks, engine tests and public build, then delivers a data-only change through the same review/merge path. This proposal is not a statement that a schedule or auto-commit exists. A documented manual `npm run update:iana` recovery path is still required.

The scheduling source is [GitHub workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule). Schedules run from the default branch, can be delayed under load, and may be disabled on inactive public repositories; do not treat them as a delivery SLA. A read-only scheduled check without a merged reference update does not refresh the deployed site.

When reference refresh fails or an open tab ages past the ceiling, preserve raw/normalized user input and drafts; retain the last good data with its original timestamps, never change its collection date to disguise age. Keep stale-reference UNKNOWN separate from syntax INVALID and from verified mail-route evidence. A same-origin retry only obtains the current deployed artifact: it cannot repair an old deployment by itself. Test this distinction with explicit clocks. Avoid a blanket stale VALID bypass or replacing normal input with an empty value.

## Publication verification

1. Read the newest remote main and preserve its history; keep old PR #1 separate. Record the reviewed integration commit and exact UX handoff hash.
2. Run engine, frontend build, output inventory and actual local browser transactions on that same candidate.
3. Save and reread the exact Pages Git/build/branch settings. Inspect only an actually connected competing Render service; installed-app evidence alone is not proof of deployment.
4. Push the authorized branch, verify its remote HEAD and PR/CI, merge the reviewed change under MSG0504 authority, then reread remote main.
5. Confirm the Pages production deployment references that main SHA and succeeded. Read the exact canonical root and non-UI build identity with cache revalidation. Record deployment ID, source SHA, assets hash and IANA version/hash.
6. Test real root F00/Q1–Q4, phone/email/allocation/date/copy/cancel/save/reopen/refresh, console and actual DNS traffic. Browser/Linux results do not claim Windows/iPhone acceptance.

Use `CF_PAGES_COMMIT_SHA` at build time for identity when present, with checked local Git SHA as a local-build fallback. Include the actual IANA digest and integrated HTML digest: a commit SHA alone cannot identify output if an external reference was refreshed during the build. Keep identity out of customer-visible prose. Cloudflare [static headers](https://developers.cloudflare.com/pages/configuration/headers/) support `_headers`; apply MIME sniffing protection and appropriate revalidation for HTML/reference/identity, and immutable caching only for content-hashed assets. Review the actual frontend's external origins before enforcing CSP.

Evidence required for W01–W04 is provider readback, remote SHA/CI, actual public output and actual root browser checks. Repository files and this review satisfy none of those by themselves. If account authorization blocks one provider operation, report that exact last operation while retaining all completed code and tests.

Future manual releases can use Wrangler on the existing Git-integrated project after automatic deployments are disabled; this does not convert its project type or authorize dashboard drag-and-drop. Keep the same project/root; see [Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/) and [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/). The current MSG0504 setting remains main automatic deployment ON.
