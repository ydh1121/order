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

`validate(fieldId,raw,{phase})` returns `{fieldId,requestId,raw,apply,syntax,dns,gate,result}`. `apply:false` means a newer field request or cancellation owns the UI; the returned historical result must not change field/parent/badge/CTA state. There are no storage/DOM writes inside the service. Reference expiry and refresh failure preserve both raw and normalized input. Final completion still requires the current valid syntax+DNS gate; stale reference data produces UNKNOWN, not an invalid-address error or success.

Parallel fields on the same normalized domain share one DNS evaluation. Same-field local-part changes reuse a still-needed domain request. Removing one subscriber does not cancel another; the final subscriber leaving aborts the shared request. Late cancelled results cannot fill the cache or call `onResult`. TTL cache uses the core's complete dependency `validUntil`; unknown/zero TTL results are not cached. `invalidateDomain(domain)` clears the cached/current evaluation, and `clear()` cancels all work. Cache and request ownership exist only in memory.

## Browser IDNA and DoH

`browserDomainToASCII()` uses WHATWG `URL` host mapping, rejects URL authority/path injection, and validates each A-label with a bounded RFC3492 decode plus Unicode-to-URL round-trip. This covers the runtime where malformed A-labels may otherwise be left unchanged. The validator still owns the supported ASCII local-part profile; Unicode local-parts remain UNSUPPORTED.

`createBrowserDnsResolver({fetcher,now,provider,maxRequests,timeoutMs,retries})` creates one bounded evaluation session. Allowed providers are fixed code entries: `cloudflare` (default, `https://cloudflare-dns.com/dns-query`) and `google` (`https://dns.google/resolve`). There is no caller-controlled endpoint, arbitrary URL, SMTP probe or verification email. Only normalized domain/MX names are sent. Requests use CORS, omitted credentials, no referrer, no-store and redirect rejection. Google requests set an empty ECS subnet. A browser CORS/network failure is uncertain.

The JSON adapter verifies response question/name/type, truncation, bounded record/body sizes, CNAME chains and requested-owner answers. Positive TTL includes the alias chain and deducts HTTP Age. An HTTP Age that exhausts a TTL returns uncertainty rather than manufacturing a fresh zero-TTL answer. Negative TTL uses only SOA zones enclosing the terminal owner, bounded by any alias TTL; absent relevant SOA means current-query-only evidence. Null MX, IPv6 implicit route and sixth-MX routing use the unchanged core. The adapter can retry transient HTTP/network/timeout failures at most once; default retries are zero. Retries consume the same HTTP request budget. Default core limits remain 32 DNS questions, 32 HTTP requests, 1.5 seconds per question and 10 seconds total. Cancellation and timers settle even if an injected fetch implementation ignores abort.

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

Runtime refresh only fetches the exact same-origin `/assets/iana-reference.json` asset. A single pending refresh and 60-second retry cooldown prevent repeated work. Downgraded versions, conflicting same-version hashes, major unexplained count loss, bad hashes, stale/future dates, oversized content and timeouts are rejected while the prior snapshot remains intact. Timeout/close also revoke the request's write lease, preventing a late result from replacing current state. No arbitrary third-party reference URL is accepted.

The static runtime cannot publish new official reference data by itself. The deployment owner must run the existing official updater, test, commit and rebuild on a daily maintenance schedule, or use `refresh:true` in its approved build flow. The root integration owns that schedule and build wiring. The build freshness gate prevents deploying an expired snapshot unnoticed. If refreshing is blocked, the browser preserves the draft, returns neutral UNKNOWN and blocks final completion; it never erases all existing contact values because the date advanced. Reference freshness is rechecked after DNS completes, so expiry during a pending lookup cannot retain a stale successful final gate.

Maintenance tests keep the original 20261031 raw file as an explicitly pinned historical checksum case. Current-manifest integrity tests independently compute its raw SHA and derive test time from its collection timestamp, allowing a reviewed new version/count to pass without rewriting historical expectations. Refresh tests reject same-version/different-hash changes and verify that failure preserves the prior pointer.

## Executed evidence and remaining environment checks

```
node --test test/engine/browser-email.test.mjs
node --test test/engine/browser-email.test.mjs test/engine/review-browser-email.test.mjs test/engine/email*.test.mjs test/engine/review-email.test.mjs
node scripts/engine/browser-email-smoke.mjs https://order-ooo.pages.dev
```

The 13 new deterministic tests and 3 independent review cases cover literal IDN expectations, browser import boundaries, request options, Null MX, sixth MX/query budgets, all-absent/IPv6 paths, HTTP retry/timeout/abort, malformed answers, alias TTL/HTTP Age, raw hash verification, stale input preservation, reference late-response leases, parallel-field cancellation, same-field deduplication and TTL expiry. The previous 26 email cases also remain applicable. These are synthetic transport tests, not browser online PASS.

The actual optional HTTPS browser probe was attempted. Playwright was available, but Chromium's executable was absent; the official Playwright download returned a zero-size/non-ZIP payload and installation failed. No browser URL/HTTPS/CORS success is claimed. The smoke script is ready for an environment with Chromium; it loads these exact module bytes into the requested HTTPS origin and reports origin, secure-context, browser version, actual IDNA outputs and DNS evidence. It is an adapter probe, not a substitute for root UI integration tests.

Separate actual Node HTTPS DoH attempts at 2026-10-31T23:35:55–56Z (2026-11-01 08:35 KST) queried `example.com` and `iana.org` through the Cloudflare endpoint. Both timed out after one MX request and returned UNKNOWN / DNS_TIMEOUT. This is an actual attempted HTTPS observation; Node does not enforce browser CORS, so it is not browser acceptance. Actual target-origin fetch/CORS, Windows/iPhone interaction, restored UI transactions and product completion remain for the integration owner to execute.

## Official references inspected

- [Cloudflare JSON DoH interface](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)
- [Google Public DNS JSON interface](https://developers.google.com/speed/public-dns/docs/doh/json)
- [WHATWG URL / IDNA](https://url.spec.whatwg.org/#idna)
- [Cloudflare public resolver privacy](https://developers.cloudflare.com/1.1.1.1/privacy/public-dns-resolver/)
- Source standards and IANA provenance remain in [email.md](email.md) and [references.md](references.md).
