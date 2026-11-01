# MSG0519 address data and storage contract

Base: `4deef1debac442f2f1c6903e54f92a4e0944d316`. Existing WO-ORDER-20261101-ASTRA-ENGINE-001. These are implementation and synthetic-test notes, not actual JUSO, canonical HTTPS, OS or user acceptance evidence.

## Component reuse matrix — address data and storage

| Owner/source | Role and actual consumers | Tokens | State/contract |
| --- | --- | --- | --- |
| `web/address-contract.mjs` `addressFields` | Address-only projection; `blankSite`, nested address editor and parent confirm in `web/app.mjs` | None; data only | Copies road/postal/detail/jibun/region/providerId/dropoff/addressProvider only. Cannot overwrite stable ID or current contacts. |
| `web/address-contract.mjs` `addressStatus` | Consumed by shared `OrderSiteContract.issues` in `web/common-ui.mjs`, Q3 save label and saved state projection | None; data only | EMPTY / UNVERIFIED / PROVIDER_SELECTED. Query text and restored legacy provider ID are not selected-provider evidence. |
| `web/address-contract.mjs` `selectAddress` | Selected candidate transition in `web/address-ui.mjs` | None; data only | Same building retains optional detail/dropoff; different building clears them in the child draft. Provider response never owns user-entered detail/dropoff. |
| `web/address-contract.mjs` `addressLines` | Q3 trigger and summary plus delivery-address result rendering in `web/app.mjs` | Existing `.ui-location-lines` presentation owner | Derives road + detail, postal, dropoff lines; empty optional lines omitted. Postal is always a string. |
| `web/storage.mjs` `projectStoredPayload` | Single confirmed-state projection consumed by app save coordinator and storage `commit` | None; data only | Strict schema3 adds flat dropoff and addressProvider. Transient DNS/result status remains excluded. |
| `web/storage.mjs` `decode`, `migrateLegacy` | Same authoritative durable key `order_q1_q4_v1`, existing Web Lock and revision/token/receipt transaction | None; data only | Versions1/2 validated under their historical field lists, read without rewriting or provenance promotion. Next successful explicit commit writes3; reset stays authoritative. |

`addressProvider: "JUSO"`, nonempty bounded road, a five-digit postal string and a 25-digit building management ID establish a *chosen search result*. They do not establish building occupancy, delivery eligibility or order approval. No live lookup or permanent DNS PASS is restored. The historical `addressState` field is not a trust source.

Schema3 accepts `dropoff` as an independent optional string of at most 4,096 UTF-16 code units. It does not share Q4 delivery memo storage. The UI uses the same maxlength. Detail, dropoff and legacy text are not trimmed or rewritten by storage. New provider identity/road rejects control characters; optional user text is preserved. `addressLines` trims only for display, without changing source data.

Old records can omit the new optional fields. `addressFields` supplies empty strings when creating an editing draft; omission itself never grants provider provenance. A version1/2 envelope or legacy session containing schema3-only provenance/dropoff fields is rejected as corrupt, so a damaged old record cannot silently acquire new semantics. No source bytes are deleted before a successful write.

The existing transaction owner is unchanged: child search/selection/confirm is memory only; the parent app save coordinator submits contacts and address in one payload. Native localStorage write, readback verification, Web Lock, revision plus SHA token and bounded transaction receipts remain the sole durable write path. A failed write preserves source bytes and caller draft, concurrent tabs conflict without merge, and an explicit reset blocks stale resurrection.

## Synthetic verification

`node --test test/engine/address-contract.test.mjs test/engine/address-storage.test.mjs test/engine/storage.test.mjs` passed 40 tests (11 new address/storage tests and 29 existing storage tests) at this implementation checkpoint. This is one current run, not a sum with past MSG0517 totals. Tests use a MemoryStorage/LockManager double and provider-shaped synthetic addresses; actual browser/provider evidence is recorded by the parent integration report.

Coverage includes strict new fields, readonly old-schema restore and atomic upgrade, legacy non-promotion, postal08843, detail/dropoff optionality and same/different selection, address-only patch preserving edited contacts, cancellation0/write1/duplicate0, failed writes, two-tab conflicts and reset. The production-gate VM tests additionally invoke the real shared `OrderSiteContract` with the pure address status contract to distinguish missing/unverified/selected addresses while preserving addressless Q4 draft editing.

Historical F09 profile relaunch timeout cause remains unknown; this change makes no claim to resolve it.
