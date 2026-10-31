# Astra independent engine — contract 1.0.0 / engine 0.1.0

WO-ORDER-20261101-ASTRA-ENGINE-001, MSG-20261101-0499, PENDING-26.
This is an isolated Node ESM core, not a product release or UX replacement.

## Run

Node 22 or newer, no third-party runtime packages required.

```sh
npm test
npm run test:engine
npm run example:engine
# Optional online observation, never part of deterministic tests:
npm run smoke:dns -- example.com iana.org
# Explicit maintenance operation; changes pinned reference files:
npm run update:iana
```

`test:engine` recursively discovers `.test.mjs` files below `test/engine`.
`npm test` uses the same node:test runtime and includes the unchanged old quote suite.
The small runner selects `.test.mjs` files only, so fixture modules are not counted
as tests, and future nested tests are discovered.
The workflow `engine-checks.yml` runs tests on Node 22 and 24 without deploy steps,
secrets, new endpoints or database resources. Workflow presence is not a CI run.

## Modules and contracts

| API | Document |
|---|---|
| validatePhone / createPhoneState / editPhone / finalizePhone | [phone](phone.md) |
| validateEmailSyntax / emailCompletionGate / validateEmailDomain | [email](email.md) |
| enumerateCombinations | [combinations](combinations.md) |
| calculateQuote / exact arithmetic / periodQuantity / monthlyDayIntent | [calculation](calculation.md) |
| loadIanaSnapshot / update helper | [reference provenance](references.md) |
| Existing HTML / quote differences | [compatibility](compatibility.md) |

All result envelopes carry `status`, `reasonCodes`, exact `raw`, `normalized`,
`field`, `versions:{engine,contract,rules,data}`, and `evidence`. Results snapshot
inputs at return, so later caller mutations do not rewrite the recorded evidence.
Decimal and rational quantities are JSON strings or `{numerator,denominator}`;
see the arithmetic contract for limits. Caller input is plain structured data.

| Status | Meaning |
|---|---|
| EMPTY | Exact empty input; required/explicit optional clear is a separate gate |
| INCOMPLETE | Supported editing prefix, not a completed input |
| INVALID | Confirmed failure within supported scope |
| UNSUPPORTED | Outside the implemented profile; not necessarily invalid by a standard |
| UNKNOWN | External observation, reference age, or search budget cannot decide |
| UNAVAILABLE | Required catalog, approved price or other declared data absent |
| POLICY_UNRESOLVED | A required business rule is missing/conflicting |
| VALID | Only the particular module's declared scope passed |

The generic `completionGate` preserves drafts and treats UNKNOWN neutrally while
blocking field completion. Optional empty fields require an explicit clear signal.
Syntax-only email VALID cannot pass this generic gate; use `emailCompletionGate`
with matching domain DNS evidence. Neither gate grants registration, identity,
mailbox ownership, an actual order, payment, or supply approval. DNS observations
must be refreshed by the caller; old stored VALID results are not perpetual passes.

Alternative UNKNOWN policies (final submission allowed, asynchronous follow-up,
or manual override) change acceptance and operational responsibility. They remain
unimplemented pending planning approval; current UX completion blocking remains.

## Integration boundary

UX owns DOM events, focus, cursor, IME, customer copy and error exposure timing.
Engines return reason codes and evidence, not customer-facing explanations.
Existing `src/quote.mjs`, `data/offers.json`, app/UX HTML/CSS and PR #1 are untouched.
Synthetic products/prices exist only under `test/fixtures/engine/`; examples do not
load them into the product. Live approved prices remain unavailable.

Pin the local/remote commit SHA, HTML SHA, contract, rules, fixture and IANA
manifest before integration. This implementation does not itself authorize UX
connection, main merge, deployment, database writes, reservations or orders.
