# Browser email boundary — MSG0504 I02/I04

`dns-browser.mjs`, `iana-browser.mjs`, and `email-browser.mjs` contain no Node imports or Node globals. They consume the existing pure `email.mjs`, `email-dns.mjs`, and common result contract. This change does not edit the UX HTML/CSS or activate a new server/Worker. Provider/reference internals remain developer evidence, not customer copy.

## Integration API

```js
import {createBrowserIanaProvider} from './src/engine/adapters/iana-browser.mjs';
import {createBrowserEmailService} from './src/engine/adapters/email-browser.mjs';

const references = createBrowserIanaProvider({origin:location.origin});
const emails = createBrowserEmailService({referenceProvider:references});
const packet = await emails.validate(`${siteId}:email`, rawInput, {phase:'complete'});
if (packet.apply) {
  // Feed this same result into field/parent/badge/save projection.
  // Preserve raw input. Map codes through the existing UX copy contract.
  projectEmailState(packet.result, packet.gate);
}
// On transaction cancellation/removal:
emails.cancel(`${siteId}:email`);
// On application teardown:
emails.close(); references.close();
```

`validate(fieldId,raw,{phase})` returns `{fieldId,requestId,raw,apply,syntax,dns,gate,result,diagnostic}`. The separate diagnostic is versioned and domain-only: it excludes the local part, raw address and field identifier, and retains reference version/hash plus provider observations for a future authorized operations screen. `apply:false` means a newer field request or cancellation owns the UI; the returned historical result must not change field/parent/badge/CTA state. There are no storage/DOM writes inside the service. Reference expiry and refresh failure preserve both raw and normalized input. Final completion still requires the current valid syntax+DNS gate; stale reference data produces UNKNOWN, not an invalid-address error or success.

Parallel fields on the same normalized domain share one DNS evaluation. Same-field local-part changes reuse a still-needed domain request. Removing one subscriber does not cancel another; the final subscriber leaving aborts the shared request. Late cancelled results cannot fill the cache or call `onResult`. TTL cache uses the core's complete dependency `validUntil`; unknown/zero TTL results are not cached. `invalidateDomain(domain)` clears the cached/current evaluation, and `clear()` cancels all work. Cache and request ownership exist only in memory.

## Product contact integration

`web/contact-ui.mjs` installs the shared `createOrderPhoneAdapter()` as `OrderPhone`. Its `OrderEmail.parse()` calls the core syntax parser with the browser IDNA adapter; a syntactically valid address remains editable while reference/DNS checks are pending. The local part and raw input are preserved. The existing email editor retains composition, caret, paste/drop, suggestion, undo/redo, cancellation and dialog-reset behavior. Suggestions are an editing convenience, never a domain allowlist.

`OrderEmailDomain` preserves the existing `validate`, `status`, `peek`, `subscribe`, `isSuccess`, `isHard` and `clearCache` call sites, and adds `isCurrent(proof,email)`. The underlying browser service owns DNS traversal, budgets, cancellation, single-flight and TTL. A small compatibility projection maps its current result into the existing UI states; it contains no second DNS implementation. Parent, badge and save consumers read that same projection. Reference data comes only from the verified same-origin asset. Mutable resolver/snapshot QA hooks are absent from the shipped module; tests intercept transport outside the product.

| Shared result | Existing UI state | Completion |
| --- | --- | --- |
| VALID with current reference and positive reusable DNS TTL | `MX_ROUTE_FOUND` / `IMPLICIT_ROUTE_CANDIDATE` | Allowed as domain preflight only |
| Definitive invalid TLD or DNS absence with current reusable evidence | `INVALID_TLD` / `DOMAIN_NOT_FOUND` / `MAIL_DISABLED` / `NO_MAIL_ROUTE` | Blocked |
| UNKNOWN, expired reference or network failure | `UNKNOWN` | Preserved draft, neutral, blocked |
| Current-query-only definitive DNS proof | Actual verdict only in the active transaction; global lookup remains `UNKNOWN` | May be consumed only with `isCurrent(proof,email)` |
| Query pending | `CHECKING` | Preserved draft, blocked |

Compatibility proof expiry is the earlier of the full DNS dependency expiry and IANA freshness expiry. `validate(domain,{raw,signal})` returns a zero/unknown-TTL current observation without inventing an expiry. `isCurrent(proof,email)` accepts this proof only while its original AbortSignal is active, exact raw input and generation are unchanged, the reference is fresh and the clock has not moved backwards. The proof identity is held in a private WeakMap; a copied object is not a proof. Global `peek/status` retain neutral UNKNOWN and never cache that success. The editor exposes `instance(input).proof()` and passes the current result through save and `canCommit`; final completion obtains its own transaction proofs and verifies the unchanged order/revision before consuming them. Proofs are not stored or restored. Clearing/editing/cancelling revokes the editor proof. `cancelPending()` preserves the active editor, raw text and undo history while revoking pending work, so a discard-confirmation cancellation can resume editing. UNKNOWN retries are limited to two additional attempts per raw input (1.5 and 5 seconds), with no customer-facing revalidation control.

`node --test test/engine/contact-ui-contract.test.mjs` passes seven synthetic Node cases covering public API compatibility, literal IDN and phone expectations, shared current proof, missing TLD, no invented TTL, cancellation/deduplication, expiry, raw preservation and absence of mutable QA hooks. This test does not mount a DOM or establish actual browser/CORS/OS acceptance; the product browser suite owns those checks.

## Browser IDNA and DoH

`browserDomainToASCII()` uses WHATWG `URL` host mapping, rejects URL authority/path injection, and validates each A-label with a bounded RFC3492 decode plus Unicode-to-URL round-trip. This covers the runtime where malformed A-labels may otherwise be left unchanged. The validator still owns the supported ASCII local-part profile; Unicode local-parts remain UNSUPPORTED.

`createBrowserDnsResolver({fetcher,now,provider,maxRequests,timeoutMs,retries})` creates one bounded evaluation session. Allowed providers are fixed code entries: `cloudflare` (default, `https://cloudflare-dns.com/dns-query`) and `google` (`https://dns.google/resolve`). There is no caller-controlled endpoint, arbitrary URL, SMTP probe or verification email. Only normalized domain/MX names are sent. Requests use CORS, omitted credentials, no referrer, no-store and redirect rejection. Google requests set an empty ECS subnet. A browser CORS/network failure is uncertain.

The JSON adapter verifies response question/name/type, truncation, bounded record/body sizes, CNAME chains and requested-owner answers. Positive TTL includes the alias chain and deducts HTTP Age. An HTTP Age that exhausts a TTL returns uncertainty rather than manufacturing a fresh zero-TTL answer. Negative TTL uses only SOA zones enclosing the terminal owner, bounded by any alias TTL. CNAME plus a relevant final-name SOA and no requested record is legitimate NODATA; implicit A/AAAA then uses the canonical name. Bare aliases, referrals, loops and CNAME/data contradictions remain UNKNOWN. Null MX, IPv6 and sixth-MX routing retain distinct verdicts. The low-level resolver defaults remain compatible for isolated probes; the product email service now observes both fixed providers and waits for both. Positive versus definitive negative is a provider conflict (UNKNOWN); negative versus failure is unconfirmed (UNKNOWN); a positive plus failed observation can prove a route, with partial agreement recorded. Supporting positive TTLs use the minimum. Product policy is 32 shared logical queries, 32 shared HTTP requests, 2.5 seconds per HTTP attempt, at most one transient retry (including SERVFAIL/429), and a 12-second DNS evaluation limit. Retry attempts consume the shared HTTP budget. Cancellation and timers settle even if an injected fetch implementation ignores abort.

Cloudflare documents its JSON interface as following Google's format and notes that it is not a formally standardized JSON RFC. Therefore schema mismatch is UNKNOWN, not proof of route absence. This is preflight reachability evidence; DNS registration, web availability, reseller listing, actual email delivery and ownership are separate claims.

## IANA build and refresh ownership

Build-side helper (Node only, never browser-imported):

```js
import {buildBrowserReference} from './scripts/engine/build-browser-reference.mjs';
await buildBrowserReference({outputPath:'dist/assets/iana-reference.json'});
```

```
node scripts/engine/build-browser-reference.mjs --out dist/assets/iana-reference.json
node scripts/engine/build-browser-reference.mjs --out dist/assets/iana-reference.json --refresh
```

The helper verifies the current immutable source bytes/manifest and refuses stale/future source data. `--refresh` uses the existing bounded official IANA updater before building. The output is `{schemaVersion:1,manifest,rawText}` with original source bytes represented losslessly; it contains no fixture or customer data. The browser verifies source SHA-256 with WebCrypto and reparses exact source metadata, count, ordering and sentinel labels. This checks deployment integrity; it is not described as a digital signature.

Runtime refresh only fetches the exact same-origin `/assets/iana-reference.json` asset. A single pending refresh prevents duplicate work. Healthy refresh uses a 60-second cooldown; failed refresh uses a separate 1.5-second cooldown so a temporary first-load failure can recover during the bounded editor retry. Asset requests time out at 2.5 seconds and the service bounds reference waiting at 3 seconds. These limits do not change the seven-day source freshness rule. Downgraded versions, conflicting same-version hashes, major unexplained count loss, bad hashes, stale/future dates, oversized content and timeouts are rejected while the prior snapshot remains intact. Timeout/close also revoke the request's write lease, preventing a late result from replacing current state. No arbitrary third-party reference URL is accepted.

The static runtime cannot publish new official reference data by itself. The deployment owner must run the existing official updater, test, commit and rebuild on a daily maintenance schedule, or use `refresh:true` in its approved build flow. The root integration owns that schedule and build wiring. The build freshness gate prevents deploying an expired snapshot unnoticed. If refreshing is blocked, the browser preserves the draft, returns neutral UNKNOWN and blocks final completion; it never erases all existing contact values because the date advanced. Reference freshness is rechecked after DNS completes, so expiry during a pending lookup cannot retain a stale successful final gate.

Maintenance tests keep the original 20261031 raw file as an explicitly pinned historical checksum case. Current-manifest integrity tests independently compute its raw SHA and derive test time from its collection timestamp, allowing a reviewed new version/count to pass without rewriting historical expectations. Refresh tests reject same-version/different-hash changes and verify that failure preserves the prior pointer.

## Executed evidence and remaining environment checks

```
node --test test/engine/browser-email.test.mjs
node --test test/engine/browser-email.test.mjs test/engine/review-browser-email.test.mjs test/engine/email*.test.mjs test/engine/review-email.test.mjs
node scripts/engine/browser-email-smoke.mjs https://order-ooo.pages.dev
```

The probe resolves the repository's pinned `playwright` dependency normally. An explicit `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.js` can select a different installed module; it no longer depends implicitly on a host runtime package directory. Install the matching Chromium with that pinned Playwright CLI before invoking it. CI must retain stdout JSON even for nonzero exit status.

| Exit | Probe outcome | Meaning |
| --- | --- | --- |
| 0 | PASS | HTTP origin/secure context/IDNA/budget assertions pass, and both public sample domains yield definitive DNS observations through real readable browser HTTPS/CORS responses. No particular live DNS answer is hardcoded. |
| 1 | FAIL_STRUCTURAL | A required origin, IDNA, runtime error, input-contract or budget assertion failed. |
| 2 | FAIL_EXECUTION | Dependency/browser launch, HTTP origin navigation, module loading/CSP or other execution prerequisite failed; successful online evidence was not established. |
| 3 | ONLINE_INCONCLUSIVE | Structural checks passed, but UNKNOWN, timeout, CORS/network, or insufficient readable response evidence prevents online PASS. |

The JSON includes checkout commit, dirty source paths, exact source-module hashes and graph digest, Node/OS/Playwright/Chromium versions, timestamps, navigation status and actual origin, browser request/response/failure records, exposed and Playwright-observed CORS headers, readable JSON question/status, IDNA assertions and final per-domain verdicts. It explicitly marks deployed build/IANA and product acceptance as unverified. Module data URLs carry the local checkout bytes into the requested HTTPS page; no network interception, CSP bypass or public QA hosting is used. `https://example.com` is permitted as an adapter-only origin when the canonical page is not yet available, and cannot satisfy W04.

The 13 new deterministic tests and 3 independent review cases cover literal IDN expectations, browser import boundaries, request options, Null MX, sixth MX/query budgets, all-absent/IPv6 paths, HTTP retry/timeout/abort, malformed answers, alias TTL/HTTP Age, raw hash verification, stale input preservation, reference late-response leases, parallel-field cancellation, same-field deduplication and TTL expiry. The previous 26 email cases also remain applicable. These are synthetic transport tests, not browser online PASS.

The actual optional HTTPS browser probe was attempted. Playwright was available, but Chromium's executable was absent; the official Playwright download returned a zero-size/non-ZIP payload and installation failed. No browser URL/HTTPS/CORS success is claimed. The smoke script is ready for an environment with Chromium; it loads these exact module bytes into the requested HTTPS origin and reports origin, secure-context, browser version, actual IDNA outputs and DNS evidence. It is an adapter probe, not a substitute for root UI integration tests.

Separate actual Node HTTPS DoH attempts at 2026-10-31T23:35:55–56Z (2026-11-01 08:35 KST) queried `example.com` and `iana.org` through the Cloudflare endpoint. Both timed out after one MX request and returned UNKNOWN / DNS_TIMEOUT. This is an actual attempted HTTPS observation; Node does not enforce browser CORS, so it is not browser acceptance. Actual target-origin fetch/CORS, Windows/iPhone interaction, restored UI transactions and product completion remain for the integration owner to execute.

## Official references inspected

- [Cloudflare JSON DoH interface](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)
- [Google Public DNS JSON interface](https://developers.google.com/speed/public-dns/docs/doh/json)
- [WHATWG URL / IDNA](https://url.spec.whatwg.org/#idna)
- [Cloudflare public resolver privacy](https://developers.cloudflare.com/1.1.1.1/privacy/public-dns-resolver/)
- Source standards and IANA provenance remain in [email.md](email.md) and [references.md](references.md).


## MSG0521 regression scope

`test/engine/rework-0521-email.test.mjs` exercises the production two-provider default with independent expectations for canonical CNAME/NODATA, IPv6, alias/referral/loop conflicts, provider agreement and disagreement, shared budgets, sixth MX, transient retries, TTL0, consumer cancellation and IANA loading/failure recovery. `contact-ui-contract.test.mjs` verifies raw-bound transaction proof identity, signal cancellation, generation clearing and no global zero-TTL PASS. Earlier provider-isolated tests explicitly select one provider so their per-resolver budgets and query ordering remain meaningful. They are synthetic Node checks, not live DNS, browser or OS acceptance.

`node scripts/engine/browser-email-smoke.mjs https://order-ooo.pages.dev --product-policy` runs the current checkout service on the actual canonical HTTPS origin, fetches the live same-origin IANA asset, and observes 21 input samples (20 normalized domains, including the Unicode/Punycode pair) through the new two-provider policy. These include all 16 actual DNS samples specified in MSG0521 §3.3, with the existing extra diagnostic candidates retained. It records the exact module hashes, runtime and provider observations without mocking transport or assuming current DNS success. It does not certify that the deployed product contains those checkout bytes or that root UI flows passed. The original `--expanded` individual-adapter probe remains available and has separate 1.5-second resolver limits. A local MSG0521 attempt could not launch because Chromium was absent; its online result is NOT_RUN.

The existing `iana-maintenance.yml` is the sole maintenance workflow. Its existence is not evidence that a scheduled/manual run, reference update or production redeployment succeeded. The first historical profile-relaunch DNS timeout remains unresolved; faster bounded reference recovery is not a retrospective root-cause claim. Actual user multi-domain complaints remain subject to current root-flow and browser evidence.
