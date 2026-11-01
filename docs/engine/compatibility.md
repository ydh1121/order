# Existing code and UX comparison — MSG0499

This engine is a candidate for later integration. No UI source was modified, and
no API entry point in `src/quote.mjs` was replaced. A successful isolated engine
test does not approve the product, a real order, or the current UI.

## Exact inputs and reproduction

| Input | Bytes | SHA-256 |
|---|---:|---|
| MSG0494 HTML | 482496 | `226e3594c7460299e78558bb8c96a917d33d2d56725a7fc05cb64ff7cb80a529` |
| MSG0497 HTML | 489172 | `eab0194284dc79634a82c26cc420c9ed52232d4ab6983be906a773780810fcce` |

MSG0497 was discovered after the kickoff instruction. It remains a produced,
unapproved UX candidate; a newer filename is not approval. Source URLs:

- [MSG0494](https://drive.google.com/file/d/1KUJN2HGZ4kP96bOeyGA6gJKPtCFQM0ye/view)
- [MSG0497](https://drive.google.com/file/d/1e6BuwKzqiVBu6F2VDzFqOpKeVtE58IUD/view)

The comparison command requires both original files. It checks exact bytes and
hashes before extracting modules; a changed source stops the run. The HTML files
are deliberately excluded from this Git branch.

```sh
node scripts/engine/compare-ux.mjs /path/to/MSG0494.html /path/to/MSG0497.html /path/to/ux-comparison.json
```

The harness executes the **unmodified** `OrderPhone`, `OrderEmail`, and
`OrderEmailDomain` modules in Node VM. DOM methods and DNS responses are explicit
test doubles. It uses the same synthetic DNS observation table for both legacy
HTML sources and Astra, adapting only each API's response shape. The clock is
fixed at `2026-10-31T17:00:00Z`; fixture version is `ux-comparison-1.0.0`.
The resulting JSON includes every query, raw result, phone before/after state,
source hash, and candidate engine version. Eight DOM-double scenarios per HTML,
eight DNS fixtures per HTML, nine Astra DNS cases, and nine raw phone inputs per
implementation were executed. These counts are comparison coverage, not new
independent UI acceptance tests; do not add them to old UX test counts.

## Observed phone differences

All phone values below are synthetic reproduction inputs.

| Reproduction | MSG0494 | MSG0497 | Astra core | Classification |
|---|---|---|---|---|
| Append `2` to prefix of `02-2345-6789` | `02-2234-56789`; final segment exceeds 4 | Candidate rejected; original intact | Prefix replacement candidate rejected; original intact | Existing defect corrected in both candidates |
| Append `5` to prefix of `1588-1234` | `1588-51234` | Candidate rejected; original intact | Candidate rejected; original intact | Existing defect corrected |
| Append `2` to prefix of `02-234-5678` | `02-223-45678`; dataset valid=true while parser=false | Original retained; both valid=true | One verdict; invalid edit is separate from retained state | Existing defect and inconsistent verdict corrected |
| Type unseparated `022345678`, then complete | `02-2345-678`, parser=false/dataset=true | `02-234-5678`, both valid=true | Complete parse returns `02-234-5678` | Intended completion normalization |
| `02 / 234`, explicit Tab, then `5678` | `02-234-5678` | `02-234-5678` | Explicit middleWidth=3 retained | Preserved compatibility |
| Restore `010-1234-12345678` | Invalid eight digits displayed as normal last segment | Exact original in distinct single raw editor | Exact raw and originalRaw preserved, INVALID, no normalized value | Intended recovery boundary; UI rendering remains UX-owned |
| Paste `12345678` into final segment | Rejected; original retained | Rejected; original retained | `scope:'segment'` rejected | Preserved compatibility |
| Paste complete `15881234` | Whole control becomes `1588-1234` | Same | Explicit `scope:'field'` returns `1588-1234` | Same outcome with explicit adapter intent |
| `070-234-5678` vs `070-2345-6789` | Invalid / valid | Invalid / valid | INCOMPLETE / VALID; neither claims allocation/ownership | More precise incomplete state; same completion eligibility |
| `+82 10 2345 6789` | Normalizes to domestic valid | Same | UNSUPPORTED, original retained | Declared supported-profile narrowing; integration decision required |

The edit API receives segment replacement candidates rather than native events.
The comparison maps the inserted prefix character to the equivalent candidate
string; it does not claim keyboard, caret, focus, IME, undo, or pointer equivalence.
Native-event tests remain the UX integration owner's responsibility.
The initial core's domestic-only profile does not normalize international input.
Existing UX `+82` support must therefore stay in a reviewed adapter or be added to
the core before a replacement integration; callers must not label it INVALID or
silently remove this existing entry path. It is a known integration limitation.

## Observed DNS differences

| Synthetic observation | MSG0494 | MSG0497 | Astra default budget | Classification |
|---|---|---|---|---|
| Only sixth MX host has A | `NO_MAIL_ROUTE`; sixth host never queried | `UNKNOWN / mx_query_budget_exhausted`; sixth host never queried | `VALID / DNS_MX_ADDRESS`, query 12 | Original false rejection fixed; Astra can finish the previously unexamined path |
| Six MX hosts, all addresses absent | `NO_MAIL_ROUTE` after inspecting only five | `UNKNOWN`, sixth unexamined | `INVALID / DNS_ALL_ROUTES_ABSENT`, query 13 | Explicitly proven failure retained once every path is examined |
| Five MX hosts, all addresses absent | `NO_MAIL_ROUTE` | `NO_MAIL_ROUTE` | `INVALID / DNS_ALL_ROUTES_ABSENT`, query 11 | Preserved hard failure |
| Null MX `0 .` | `MAIL_DISABLED` | `MAIL_DISABLED` | `INVALID / DNS_NULL_MX`, query 1 | Preserved hard failure, no A fallback |
| No MX, A present | `IMPLICIT_ROUTE_CANDIDATE` | Same | `VALID / DNS_IMPLICIT_MX_ADDRESS`, query 2 | Preserved route candidate, no mailbox/ownership proof |
| No MX, IPv6-only AAAA present | `IMPLICIT_ROUTE_CANDIDATE` | Same | `VALID / DNS_IMPLICIT_MX_ADDRESS`, query 3 | Preserved IPv6 route |
| No MX/A/AAAA | `NO_MAIL_ROUTE` | Same | `INVALID / DNS_ALL_ROUTES_ABSENT`, query 3 | Preserved hard failure |
| Domain NXDOMAIN | `DOMAIN_NOT_FOUND` | Same | `INVALID / DNS_NXDOMAIN`, query 1 | Preserved hard failure |
| Only sixth MX has A, Astra budget=11 | Not this API's parameter | Not this API's parameter | `UNKNOWN / DNS_BUDGET_EXHAUSTED`, 11 calls | Bounded search never masquerades as complete absence |

UX query counts additionally include a TLD NS request and parallel A/AAAA calls;
Astra receives a separately verified IANA snapshot and can stop after a positive
A observation. Query counts are therefore not expected to match. Both HTML
sources still expose an empty IANA snapshot (`version:null`, `sha256:null`).
The pinned Astra reference loader is separate from live DNS and does not turn a
registrar's sale list into an allowlist.

`UNKNOWN` continues to allow draft preservation and block field completion.
Changing it to unconditional success would admit unverified routes; making it a
hard invalid-address result would mislabel outages or exhausted budgets. A
manual-review final gate would require a separate workflow/approval decision and
is not applied here. `VALID` DNS means a route candidate, not an existing mailbox,
successful delivery, authenticated ownership, registration approval, or an order.

## Existing quote API and unresolved policies

| Boundary | Existing `src/quote.mjs` | Independent engine | Classification |
|---|---|---|---|
| Entry point | `quote(offers, query, now)` returns `kind` | New modules return versioned status/reason/evidence | Additive API; existing entry point unchanged |
| Empty real `data/offers.json` | `kind:'unavailable'` | `UNAVAILABLE`, no fabricated amount | Preserved missing-price behavior |
| Arithmetic | JavaScript Number multiplication | Bounded BigInt rational arithmetic, explicit rounding policy | Intended exactness improvement; independent hand expectations in tests |
| Time/replay | Optional wall-clock default | Explicit `asOf`, rule/data versions and snapshots | Intentional replay contract |
| Commodity/locations | Egg/tray scalar query | Declared product units, lines and site IDs | Additive expansion; synthetic catalog is not an approved product range |
| Thirty days vs four weeks | UX historical formulas conflict (TC0481-17) | Missing/conflicting period policy => POLICY_UNRESOLVED | Unresolved business policy, not a bug silently normalized |
| Numeric 31 vs last day | Both intents exist; short-month delivery policy pending | Separate intent; numeric 31 in a short month remains unresolved | Unresolved delivery policy |
| Freight/tax/discount/stock | Not a complete commercial contract | Missing required rule/data => unresolved/unavailable | Explicit limitation, no invented zero charge |

Legacy API assertions run alongside the new arithmetic tests; old tests are not
rewritten to approve the new API. `test/engine/calculation-quote.test.mjs` carries
the compatibility and precision assertions. The source comparison above found
no new regression in the specific exercised scenarios. It is not an exhaustive
non-regression claim. External DNS, browser/OS behavior, DB, actual orders,
production deployment, UX integration and user acceptance remain separate.

For a later integration, pin the exact HTML hash, Astra commit SHA, contract
`1.0.0`, individual rule versions and fixture versions recorded in the handoff.
Do not consume a moving branch directly. Retain UX-owned customer copy and error
timing; map reason codes to the approved presentation layer.
