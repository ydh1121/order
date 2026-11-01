# Email core 1.0.0 — MSG0499 E02/E05/E06/E07

This is a headless implementation candidate. No current HTML, input events, customer copy, final UI gate, server, or deployment was changed. A successful result establishes supported syntax and an observed potential DNS mail route only. It does not establish mailbox existence, delivery, ownership, business approval, or order acceptance.

## API and input profile

`validateEmailSyntax({raw, phase:'complete'|'editing'}, {domainToASCII, tldData, nowMs})` is synchronous and deterministic. ASCII dot-atom local-parts are supported and retain exact case. The domain is normalized through the explicitly supplied IDNA adapter and lowercased; surrounding spaces are rejected instead of silently changing the address. Limits are 64 local-part octets, 63 octets per domain label, 253 domain octets, and 254 mailbox octets after ASCII conversion. Control characters are invalid. SMTPUTF8 local-parts, quoted local-parts and address literals are unsupported profiles, not assertions that those forms violate all email standards. A missing IDNA adapter for Unicode/A-label input returns UNKNOWN.

Reference input is `{version,sourceSha256,collectedAt,sourceUpdatedAt,maxAgeMs,tlds}`. Use `loadIanaSnapshot()` from `src/engine/reference/iana.mjs`, which verifies pinned original bytes and their SHA-256. Stale, empty or malformed reference data and unavailable explicit time return UNKNOWN. An absent TLD produces INVALID only with a fresh verified reference snapshot. Domain reseller lists are never imported by this validator. A TLD match does not prove domain registration or DNS availability.

Use the `domainToASCII` adapter exported by `dns-node.mjs`, rather than injecting the unwrapped Node function: the adapter adds A-label decoding/round-trip guards because the current Node/ICU build leaves some malformed `xn--` labels unchanged. Other runtime adapters must meet the same strict input contract; they are not implicitly validated by the core.

`validateEmailDomain(domain, {resolver,now,maxQueries,timeoutMs,totalTimeoutMs,signal,maxMxRecords})` requests only the normalized domain or MX host, never the local-part. Resolver response is `{status,records,observedAt,ttl?}`; status is NOERROR/NODATA/NXDOMAIN/TEMPFAIL/TIMEOUT/ABORTED, MX records are `{priority,exchange}`, address records are IP strings. `observedAt` is numeric epoch milliseconds; TTL is seconds. Missing observation time cannot establish a route. TTL 0 is usable for the current query but is not cached.

`validateEmail(input, {syntax:syntaxDependencies,dns:dnsDependencies})` composes both stages and preserves the common envelope. Unsupported, invalid or uncertain syntax/reference states do not query DNS. Given the same raw input, explicit clock, versions, and DNS observations, the same result is returned.

```js
import {validateEmailSyntax, emailCompletionGate} from '../../src/engine/validation/email.mjs';
import {validateEmailDomain} from '../../src/engine/validation/email-dns.mjs';
import {domainToASCII, createNodeDnsResolver} from '../../src/engine/adapters/dns-node.mjs';
import {loadIanaSnapshot} from '../../src/engine/reference/iana.mjs';

const syntax = validateEmailSyntax({raw: inputValue}, {
  domainToASCII, tldData: await loadIanaSnapshot(), nowMs: Date.now()
});
const dns = syntax.status === 'VALID'
  ? await validateEmailDomain(syntax.normalized.domain, {
      resolver: createNodeDnsResolver(), now: Date.now,
      maxQueries: 32, timeoutMs: 1500, totalTimeoutMs: 10000
    }) : null;
const gate = emailCompletionGate(syntax, dns);
// The UX owner maps codes to existing approved copy and handles events/cursor/focus.
// Use an input revision token/AbortController and discard results for superseded inputs.
```

## DNS decisions and budgets

| Observation | Result |
| --- | --- |
| Authoritative resolver NXDOMAIN for queried email domain | INVALID / DNS_NXDOMAIN |
| Sole MX 0 with root target | INVALID / DNS_NULL_MX; no A fallback |
| Null MX mixed with ordinary MX or invalid preference | UNKNOWN / DNS_NULL_MX_CONFLICT |
| At least one valid address for a declared MX | VALID / DNS_MX_ADDRESS |
| No MX plus domain A or AAAA | VALID / DNS_IMPLICIT_MX_ADDRESS |
| All examined MX hosts conclusively have no A/AAAA | INVALID / DNS_ALL_ROUTES_ABSENT |
| Temporary errors and no successful route | UNKNOWN / DNS_ROUTE_UNCERTAIN |
| Query/record/time budget, cancellation, stale/malformed response | UNKNOWN with specific reason |

MX hosts are sorted by priority then ASCII host order for reproducibility, not randomized SMTP delivery. Equal hosts are deduplicated. The resolver is a route preflight, not an SMTP delivery implementation. It retries zero times. Defaults allow at most 32 queries, 128 MX records, 1.5 seconds per query and 10 seconds total. Configured limits themselves are bounded. An unvisited target remains uncertainty. The synthetic sixth-MX regression needs 12 queries to find its A record; a budget of 11 returns UNKNOWN. If all six targets lack both address families, 13 completed queries return INVALID. Malformed IP strings cannot produce a successful route.

`createDnsCacheResolver(resolver,{now,maxEntries})` is an optional adapter with TTL expiration and generation leases. A late request cannot overwrite a newer result or restore an invalidated entry. Temporary errors and records without a known positive TTL are never cached. Node's MX API does not expose TTL, so its MX responses are deliberately uncached; A/AAAA use observed TTL. Node's empty root exchange representation is normalized to `.`. Each Node query owns its Resolver so abort does not cancel unrelated work.

`emailCompletionGate(syntax,dns)` keeps the current compatibility policy: drafts preserved; UNKNOWN neutral; final completion blocked unless both current-domain results are VALID. It is separate from the core verdict. An alternative allowing UNKNOWN final completion would reduce resolver-outage friction but admit unresolved routes and require separately approved server revalidation/ownership rules. This candidate does not adopt that alternative.

The gate is a projection of the supplied observations, not a freshness service. A caller must rerun syntax/reference and DNS validation at final completion, then project those results. Do not replay a past VALID gate. Known-TTL cache entries may participate through the cache adapter; unknown-TTL historic observations are rejected. Changing input must cancel/discard the preceding asynchronous request. Runtime clock failure or regression returns UNKNOWN.

Final decisions recheck dependency freshness after the last address query: a successful route depends on its MX response and winning address response; definitive total absence depends on all absence observations. If a known positive TTL expired during later queries, the final result is UNKNOWN / DNS_DEPENDENCY_EXPIRED. Evidence contains numeric `observedAt`, `evaluatedAt`, and `validUntil` (earliest dependency expiration), or null where unavailable. Unknown/zero TTL has `validUntil:null`, `revalidationRequired:true` and `decisionScope:CURRENT_VALIDATION_ONLY`; such results are never reusable as a cached validation result. An unknown TTL received during the current bounded operation can support that current observation without inventing a lifetime.

## Reproduction and evidence boundary

```
node --test test/engine/email*.test.mjs
node scripts/engine/dns-smoke.mjs example.com iana.org
```

Synthetic suite: 17 independently asserted test cases, version `dns-synthetic-1.0.0`; RFC documentation domains/addresses, fixed clock, no real customer contact. Assertions include literal expected query counts/routes, explicit length boundaries, malformed inputs, TTL boundary and out-of-order completion. The implementation's arithmetic or decisions are not reused as the oracle.

Actual optional Node DNS smoke ran on Node v24.22.1 at 2026-10-31T17:18:12Z (2026-11-01 02:18 KST). `example.com` and `iana.org` each returned ECONNREFUSED from the environment resolver on the first MX lookup. Both results were UNKNOWN / DNS_TEMPFAIL. This is an executed environment-blocked DNS observation, not successful online validation. It does not establish either domain's real-world mail configuration. The smoke command accepts at most three domains, 16 queries each, 1-second per-query and 5-second total limits; it is separate from deterministic CI.

No browser/Windows/iPhone input events, actual mailbox, SMTP, verification email, server, DB, or production checks were executed for this module. UI event handling and integration are future work pinned to the reviewed commit and contract.

## Primary references inspected

- [RFC 5321](https://www.rfc-editor.org/rfc/rfc5321.html), sections 4.1.2, 4.5.3.1 and 5.1: mailbox syntax, size boundaries, MX and implicit address route.
- [RFC 7505](https://www.rfc-editor.org/rfc/rfc7505.html), sections 3–4: Null MX.
- [RFC 6531](https://www.rfc-editor.org/rfc/rfc6531.html): SMTPUTF8 extension distinguished from this restricted profile.
- IANA pinned source/version/hash and reseller omission samples: `src/engine/reference/iana-manifest.json` and `docs/engine/references.md`; the reference manifest owns exact provenance.

These public sources were read independently from synthetic/online execution. Successful public-document retrieval is not a successful DNS probe.
