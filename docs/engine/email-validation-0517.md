# MSG0517 F04 / F09 — domain observation and restart diagnostics

The syntax/TLD, DNS route and mailbox-ownership contracts remain separate.
No mail-provider allow-list, registrar allow-list, success override for the three
`naver.xyz` / `naver.art` / `naver.co.in` examples, or customer revalidation button
is added. The product still sends only the ASCII domain to the DNS resolver.

## F04 repeatable checks

`node --test test/engine/email-expanded-0517.test.mjs` exercises official pinned
IANA bytes with **synthetic DNS**: general, long TLD, ccTLD, multi-label,
Unicode/punycode and subdomain inputs; NXDOMAIN, Null MX, NODATA with IPv4/IPv6
implicit routing, no route, CORS/network failure, SERVFAIL, timeout, query/HTTP
budget exhaustion. UNKNOWN preserves raw draft, is neutral, and blocks completion.
These tests do not prove any live domain or mailbox exists.

`node scripts/engine/browser-email-smoke.mjs https://example.com --expanded`
observes the same checkout adapter from an actual HTTPS Chromium origin against
both Cloudflare and Google DNS. It records candidate category, normalized domain,
IANA version/hash/collection/source-update/freshness, query time/type, RCODE,
MX/A/AAAA and authority records, CORS readability, HTTP budget, normalized engine
verdict, TTL evidence and completion gate. The candidates are test observations,
not a product allow-list or guaranteed live mail domains. A change in real DNS is
reported as observed; UNKNOWN is ONLINE_INCONCLUSIVE, never coerced to PASS.
The reference is explicitly a verified checkout envelope, not proof that the
deployed root serves it. Root UI/identity acceptance remains a separate check.

Primary contracts: RFC 5321 §5 (mail routing), RFC 7505 (Null MX),
`https://data.iana.org/TLD/tlds-alpha-by-domain.txt` (delegated TLD snapshot).
The source manifest owns refresh command and the existing seven-day maximum age.
No SMTP transaction, email send, mailbox verification, or ownership test occurs.

## F09 preserved uncertainty

CI run `41276905922`, source `634a3f19432e30e8fb4996a2b6b48591f1803167`:
attempt 1 Chromium job `124760810730` failed
`S04_FULL_BROWSER_PROFILE_CLOSE_AND_RELAUNCH` at `dnsReady()`'s existing 15-second
timeout. The second profile made zero synthetic DNS requests. Attempt 2 job
`124761251037` passed all 15 storage checks on identical source. The first cause
is **unresolved**; it is not classified as an external DNS outage or fixed bug.

On another timeout, `storage.smoke.mjs` now captures non-identifying diagnostic
evidence **before** closing the profile: durable schema/state/revision and object
counts, storage readiness/pending/status, IANA request/HTTP state plus verified
reference metadata/freshness/error code, email service counts/proof-state counts,
and lifecycle boot/stopped/timer/job/running/attempt counts. No email, local part,
phone, address, stable ID, raw durable record or document text is copied to that
snapshot. The read-only inspectors do not alter validation or lifecycle behavior.
The wait duration and original PASS condition are unchanged.

Native Linux Chromium profile shutdown/relaunch is distinct from a fresh JS
context, the user's PC/OS, canonical HTTPS persistence, and a follow-up live
deployment. Evidence must retain those scope labels.
