# MSG0579 domain and future snapshot boundaries

Same WO `WO-ORDER-20261101-ASTRA-ENGINE-001`, RF-01 and RF-06. Authority: [MSG0579](https://drive.google.com/file/d/1mgYMu8wMT9Hu_HvOXrL7OKM02pDOZ6kf/view). This record does not launch a new material service, supplier app, transaction store or market-analysis feature.

## Eggs are the first material configuration domain

The current egg buyer flow remains the approved product entry. Its current route is not a declaration that eggs are the permanent top-level home of the whole future platform. Other raw materials belong to future category/domain contracts after explicit scope approval.

The existing calculation owner already receives catalog `productId`, declared units, selected offers and site IDs. It must continue to consume those domain data rather than infer an egg packaging factor from a label, assume every product is an egg, or select a supplier/global minimum itself. Egg-specific customer inputs stay in the existing buyer flow; shared arithmetic, request identity, response projection and storage ownership do not become a second vertical app. QL-09/10 company styles and R3.1 screens remain selected=NONE and integrated=NONE.

## Minimal future snapshot proposal

The following is a design requirement for a future authorized server persistence owner. No database, collection, transaction or analytics pipeline is created in this change. Existing quote evidence remains the reproducibility source; the public DTO remains a separate explicit allowlist.

| Field family | Minimum meaning | Existing evidence / boundary |
|---|---|---|
| Identity | Snapshot ID, request ID, input revision, created/observed time | Request identity and revision prevent stale responses from replacing current input; future snapshot ID is not generated as a transaction today |
| Source versions | Engine/contract/rules/data versions, fixed source revision or hash | Existing `engineResult.versions`; server source provenance, no secret provider URL or key |
| Authorized scope | Authorized business/site IDs and declared product/line/quantity/unit basis | Existing server authorization and calculation lines; do not expose unrelated businesses or private supplier terms |
| Price authority | Approved price revision/approval reference and effective interval | Server checks approval independently; a caller's metadata is not an authorization decision |
| Comparison basis | Current-purchase source reference/time plus equal period, cadence, delivery and cost-basis IDs | Declare exact scope rather than infer a month, free delivery or tax policy |
| Result | Exact currency/amounts, status/reason codes, comparison eligibility, nullable difference | Preserve unknown versus explicit zero and calculation versus retrieval outcomes |
| Coverage and expiry | Complete/partial scope, request outcome, validity end | Selected-offer arithmetic is not all-supplier search; expired values do not become current results |
| Fulfillment | Explicit order/stock/delivery confirmation evidence, or unverified/unperformed | Calculation VALID never creates order approval, stock reservation or delivery guarantee |
| Lineage | Parent snapshot/retry relation and immutable original reference | A future correction references the original; no fabricated historical raw source |

Full `evidence.replay` includes input/catalog/priceBook/rules and belongs to authorized server evidence. It is not a customer response or analytics payload. If future persistence is approved, retention/access/redaction and lawful transaction-data collection need an explicit owner and scope before implementation. Hashed source identity is not proof of permission to collect or publish it.

Future consumption/distribution/production observation may derive from authorized snapshots, but new collection, market insights, advertising, supplier apps and databases remain outside MSG0579. P30 SEO/GEO/admin expansion retains its post-commercialization condition.

## Policy decisions that remain separate

- Lowest-price selection: choose the authorized eligible supplier universe and objective (unit price versus complete total cost) before adding a selector. This change calculates the selected offer only.
- Tax, shipping and discount: the owner must supply explicit amounts and rule IDs. Unknown values remain unresolved; no default-zero policy is introduced.
- Monthly comparisons: define a shared period/quantity/cadence meaning before converting per-delivery values. Do not silently choose four weeks, 30 days or calendar months.
- Rounding: supply the approved rule/scale; missing rounding stays unresolved. Existing 167-centered quantity, near-cadence tolerance and ONCE-period unification proposals remain on hold.
- Fulfillment: a real authorized provider must supply stock/delivery confirmation if customer claims require it. The current calculation contract cannot grant this authority.
