# MSG0510 confirmed input storage

`web/storage.mjs` is the single persistence adapter for confirmed Q1–Q4 state. The first durable schema is `1`; the one localStorage key is `order_q1_q4_v1`. Legacy sources are `order_v015R2_draft`, then `order_v015R1_draft`, in sessionStorage. The adapter contains no DOM, DNS request, fixture, provider success or application approval.

```js
import {createBrowserStorage} from './storage.mjs';
const storage = createBrowserStorage();
const loaded = await storage.load();
// Keep the working copy separately. Do not replace it on failure or conflict.
if (loaded.ok) {
  const result = await storage.commit(confirmedPayload, {
    expectedRevision: loaded.revision,
    expectedToken: loaded.versionToken,
    transactionId: crypto.randomUUID(),
    canCommit: () => editorStillOpen && originalInputsStillMatch,
  });
  if (result.ok) {
    // Use result.data/revision/versionToken as the newly confirmed snapshot.
  }
}
// Reset is an explicit user action. It also works with readable CORRUPT or
// UNSUPPORTED load results, using that exact result's token and revision.
const reset = await storage.reset({
  expectedRevision: loaded.revision,
  expectedToken: loaded.versionToken,
  transactionId: crypto.randomUUID(),
  canCommit: () => resetStillConfirmed,
});
```

The factory accepts `localStorage`, `sessionStorage`, `locks`, `crypto`, `now`, `key` and `lockName` dependencies. Production defaults are the browser APIs, `Date.now` and `order-q1-q4-storage`. Tests and the separately bundled local QA LAB inject isolated implementations. Product code has no mutable QA global. `projectStoredPayload` and `emptyStoredPayload` are exported for the owning integration.

| Result | Meaning |
| --- | --- |
| `EMPTY` | No durable record and neither legacy session key exists; revision 0, token `ABSENT`. Reading alone writes nothing. |
| `LOADED`, `MIGRATED` | A structurally valid confirmed payload; migration has been written and read back successfully. |
| `COMMITTED` | One new durable envelope was written and its exact serialized bytes were verified. |
| `RESET` | A durable reset tombstone; data exposed to the UI is the blank payload. |
| `IDEMPOTENT` | The same operation and payload transaction already produced the current revision; no new write. |
| `CONFLICT` | Revision/token mismatch, reused transaction ID with different content, a superseded receipt, or pending migration. No merge or overwrite. |
| `CANCELLED` | `canCommit()` no longer returned `true`, or threw. No new write. |
| `CORRUPT`, `UNSUPPORTED` | Present data cannot be read under the supported schema. It is not an absent record and does not trigger session fallback. |
| `INVALID_DATA` | Unsupported shape/type/reference or missing transaction preconditions. Caller data remains untouched. |
| `UNAVAILABLE`, `WRITE_FAILED` | Storage, cryptography or lock access failed; no success is claimed. |

Every result includes `ok`, `status`, `revision`, `data` and `changed`; readable state also includes `versionToken`. Durable results include `generation`. Errors may include a non-sensitive field path and reason, never the source contact values. `versionToken` is SHA-256 of the exact durable record. Mutations require both this opaque token and the numerical revision. An unreadable storage API cannot supply a token and therefore cannot be reset safely.

The envelope is `{schemaVersion,generation,revision,state,data,receipts,migration,updatedAt}`. `state` is `data` or `reset`; a tombstone stores `data:null`. Normal commits and resets increase revision within the generation. Explicit recovery of damaged/unsupported bytes starts a new generation and uses the recoverable safe revision plus one; an unavailable/exhausted counter starts at one in the new generation. Token comparison prevents a pre-recovery tab with a coincidentally equal number from writing over the recovery. A valid generation whose revision is exhausted is blocked.

`receipts` retains the latest 128 transaction IDs, operation types, payload hashes and applied revisions. Retrying the current receipt is idempotent even if its original precondition token is now old. A superseded receipt is a conflict, as is a matching ID with different content. A receipt that has aged out cannot authorize an old revision. Callers must retain a transaction ID when retrying an uncertain write; a fresh ID does not represent the same attempt.

Storage keeps stable SKU/site/allocation IDs, Q1 selection, Q2 raw quantity/price and unit, reviewed rational quantity metadata, Q3 name/address/contact raw strings, Q4 monthly versus per-delivery quantities, manual/derived source, confirmed recurrence/holiday/date/contact preferences and input-bound once-confirmation fingerprints. `q4Review.draft` is the **confirmed inactive-mode input** saved by the existing Q4 serializer, so its declared nested fields are preserved. Live modal objects, DOM state and unconfirmed work are never passed to this adapter.

The allowlist excludes `stage`, error exposure/validation/DNS runtime state, `emailDomainState`, `mailboxVerified`, provider status, cached suggestions, `monthlyAllocationComplete` and temporary allocation draft revisions. The application must rerun current validation and DNS TTL checks after load. Address text and `addressState`/`basicInfoDraft` labels can survive, but the labels do not establish provider acceptance. An unknown domain field, malformed type, duplicate stable ID, duplicate line/site assignment or orphan reference fails instead of being silently discarded. Documents, receipts and business-registration uploads are not part of this schema. Structural storage acceptance does not certify phone ownership, mailbox existence, quantity validity, a price offer or an order.

Migration runs under the same exclusive lock only when the durable key is absent. A present malformed R2 does not fall through to R1. R1's declared single-address/delivery shape is converted using deterministic IDs where that old shape had no IDs; safe numeric quantity/price values become decimal strings. An empty R1 address does not create a synthetic site. Populated raw address/contact data is retained, and ambiguous/orphan legacy data remains blocked in its original session record. `open:''` and `current:null` retain their meaning. Unsupported explicit legacy version markers are blocked. Legacy source bytes are deliberately retained even after successful migration; the durable envelope or reset tombstone is always authoritative. A failed migration never deletes the source.

`navigator.locks.request(name,{mode:'exclusive'}, ...)` serializes the cooperating same-origin writers, including calls from one tab. Inside the lock the adapter rereads the record, checks revision/token and the transaction receipt, then calls the synchronous `canCommit` guard immediately before `setItem`. There is no read/check/write fallback when Web Locks is unavailable. A cancelled queued modal cannot commit after the lock becomes available. Payload projection happens before waiting, so later edits to the caller's object cannot alter an enqueued transaction. The application must still preserve its current draft and handle each asynchronous result; storage does not automatically rebase UI mutations.

Native `setItem` failure leaves the original record in place. If writing returns but readback fails or differs, the result is `WRITE_FAILED` with `uncertain:true` and `WRITE_NOT_VERIFIED`: the outcome is **not** claimed unchanged or successful. The caller retains its original snapshot and working draft; an identical transaction retry can resolve a successfully written receipt. Arbitrary scripts that bypass the shared lock, explicit browser storage clearing, browser eviction, another origin and other devices are outside the atomicity/persistence guarantee. No automatic file-origin to HTTPS migration is attempted.

The adapter bounds payload/envelope bytes at 2 MB, top-level collections at 500 records and receipt history at 128. These are storage resource guards, not supplier or price policy. Quota exceptions remain explicit failures.

Verification run:

```text
node --check web/storage.mjs
node --test test/engine/storage.test.mjs
27 tests, 27 passed, 0 failed
```

These Node tests use synthetic contacts and deterministic Storage/LockManager doubles. They cover exact fields, committed inactive-mode state, transient evidence exclusion, R1/R2 migration, corrupted/unsupported data, quota and uncertain readback failure, duplicate confirmation, competing writers, queued cancellation, token-checked reset and stale resurrection prevention. They do not establish actual browser/profile persistence. The separate `test/browser/storage.smoke.mjs` records real Chromium local HTTP, native Web Locks and persistent-profile close/relaunch evidence; its execution result must be reported separately from canonical HTTPS and user-device checks.

Browser API references checked 2026-11-01: [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) (same-origin exclusion and secure-context requirement), [Storage.setItem](https://developer.mozilla.org/en-US/docs/Web/API/Storage/setItem) (storage method and quota exception). No cross-device synchronization or server storage is introduced.
