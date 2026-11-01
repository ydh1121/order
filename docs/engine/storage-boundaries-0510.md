# MSG0510 storage boundary audit

Read-only audit of `89fe5229059119280db4cdf9c361da508d5d0d36`, before storage integration. Line references below are to this commit, not subsequent edits. `web/app.mjs` SHA-256: `86a23fa43124bf0ef3c9a1bba18abb33f4adce216b2f4535a67ffb1fef6bd908`; `web/q4-review.mjs`: `f687da9231a641f04ea45b39a291efd732902ab8caba7a40dff4e9f46960d4e5`.

Scope: actual read of MSG0510 §4, app and Q4 boundary implementations, monthly editor preparation, and pure allocation confirmation. Static source audit only; this report does not claim browser, persistence, or failure-injection PASS. It records integration requirements, not the final implementation verdict.

## Every legacy save call

The legacy `save` at app:63 increments `allocationRevision`, silently catches session storage failure, returns no result, and reconciles email. Its projection includes only `lines/current/locations/allocations/open/allocationRevision`. There are eleven call sites.

| Baseline location | State/action before save | Required transaction boundary |
|---|---|---|
| app:84–108 `show` | Changes route/DOM/history, saves all data even though route itself is not in the projection | Navigation is not domain confirmation. Remove the generic write or isolate UI metadata. Do not increment allocation revision or capture an active popup's metadata. Route transition must not discard queued Q2 data. |
| app:112 `changeOpen` | Assigns `S.open`, renders, then saves | Separate accordion view state from confirmed domain state. If durable UI metadata is retained, coordinate it through the same owner without reserializing stale domain values. |
| app:170–186 `openSiteActionConfirm` apply | Marks settled, removes site/allocation(s); line-unlink also clears assignment selection | Stage removals in a candidate, await save, then publish and close. Keep selection and confirmation review on failure. Distinguish pending from successfully settled; revalidate target snapshot inside final `canCommit`. |
| app:301–321 `closeSkuDeleteDialog(true)` | Deletes SKU/allocations, resets editor and current/open, then saves | Await before replacing domain state, clearing delete context/editor, and closing. Deletion of SKU and attached allocations is one transaction. A pending guard must cover double clicks and cancel. |
| app:493–511 `upsertSku` | Invalidates pack-dependent allocation quantity and line quantity/price, writes line; clears draft and changes current/open | Build complete candidate, including invalidations, without mutating existing allocations. Await before clearing `editing`, snapshots, or closing. Keep explicit invalidation approval and the editable draft on failure. |
| app:533 Q2 unit change | Mutates missing allocation unit tags and converts/mutates the line | Preserve exact conversion and source/unit metadata as one candidate. Await/queue its persistence before publishing a confirmed revision; retain visible chosen unit/raw on failure. Flush earlier Q2 raw edits in sequence. |
| app:534 Q2 input | Mutates raw qty/price and deletes `qtyExact`, updates numerical DOM | Maintain immediate working raw/caret and calculations; use an application-owned serialized/coalescing persistence queue. Never replace the latest typed raw with an older completed save result. See rapid-input case below. |
| app:596–610 `saveSite` | Awaits DNS, then assigns `S.locations`, expands site, calls save and closes | After DNS checks, stage candidate and await durable save before publish/close. Recheck editor generation/id/fingerprint and stored target fingerprint at final commit. Retain site inputs and reopenable errors on failure. |
| app:628–668 `openContactCopy` confirmation | Already stages target clones, but sets `applied=true`, assigns `S.locations`, saves and closes | Keep staged candidate; separate `pending` from `applied`. Await save before publishing/applied/close. On failure retain review and re-enable retry. Revalidate source, targets and selected keys inside `canCommit`. One transaction ID for one accepted review. |
| app:791 Q4 delete | Removes allocation and nulls deletion candidate, starts close; save occurs only after close animation | Move save before all destructive state changes and close. Preserve candidate and dialog on failure. Do not depend on an animation callback to make a confirmed write. |
| app:876–895 `q4ReviewCommit` | Stages/verifies patches, assigns allocations, increments `commitCount`, calls save, clears pending | Return a Promise of commit result. Persist candidate first; increment count and clear pending only on success. Check original context identity/signature and final revision under storage coordination. Failure preserves both committed allocations and Q4 draft. |

## Promise consumers and cancellation

| Baseline location | Existing behavior | Required handling |
|---|---|---|
| q4-review:733–734 `saveRegularDraft` | Synchronous `.ok` read; `finally` clears `committing` immediately | `await Bridge.commit(...)`; hold guard until settlement. A Promise must never be treated as an ordinary result. Do not close on failure/conflict. |
| app:918 once-approve | Synchronously reads `q4ReviewCommit(...).ok` | Await same Promise and guard duplicate approvals. Preserve warning/review on failed write; do not clear the only pending patch before a retry path exists. |
| q4-review:572–576 `closeProductModal`, 787 `endRegularClose` | Clears nested dialogs; marks closed; eventually cancels monthly editor and clears bridge context | Cancel queued operation via generation/`canCommit`, or explicitly block closing while the write linearizes. Never report cancellation after secretly allowing an already queued unconfirmed write. Clear draft only when closing is actually accepted. |
| app:590 `closeSiteEditor` | Cancels DNS consumer, clears draft and bumps save revision | Existing DNS cancellation token must also invalidate a queued storage operation. A stale completion cannot close a newly opened editor or publish cancelled values. |
| app:653 contact-copy close | Sets `closed`, disables apply, removes dialog after animation | `canCommit` must include `!closed`, target review identity and generation. A failed copy must not remain permanently `applied`. |
| app:180 action-confirm close | Marks settled even on cancel | Track cancelled/pending/applied distinctly; cancelled operations must fail `canCommit`. Preserve the target review on storage failure. |
| app:331–340 Q1 back/cancel | Back only returns to edit; cancel clears draft and restores `current/open` | No durable write on cancel/back. Pending save token must be invalidated before clearing draft. Restore view metadata without copying the unconfirmed product to storage. |
| app:301(false), 789 Q1/Q4 delete cancel | Closes and clears deletion context | No save. A pending delete must be cancelled or its close explicitly deferred until settlement. |
| app:689 Q4 assignment cancel; 697–702 next | Cancel drops selection and aborts DNS. Next clones assignments and opens Q4 without a save | Preserve this draft-only transition. The assignments become durable only with final Q4 save. |
| app:917 once-return | Clears warning patches and returns to Q4 | No save; invalidate any queued approval. Parent Q4 values remain editable. |
| q4-review:175–237 nested settings copy | Copies only local Q4 state/monthly draft; cancel clears selection metadata | No durable storage here. Final parent Q4 confirmation remains the only write. Repeated child apply must not create extra durable revisions. |
| app:820 `fromHash`, 564–570 navigation guard | Blocks most active editors and restores route on refused back | Include pending persistence/unsaved Q2 state in navigation policy. Do not silently lose raw values or allow result success while a failed write is unresolved. |

There is no durable reset owner or product reset action in these baseline modules. New explicit reset must await `adapter.reset` and publish blank state only on success; failure/conflict retains input and existing durable data. Reset must invalidate queued editor/input generations and retain the persistent tombstone/revision. DOM field resets and `OrderRepeatContract.resetPeriod` are not a durable reset.

## Draft separation: actual findings

* Q3 `siteEditing` is a deep clone (app:589). Q4 input/context is cloned (app:871–873; q4-review:688–706). Neither is directly included in the legacy storage projection. No unconfirmed Q3/Q4 field leak was found at those serialization boundaries.
* Q1 opening edit/add mutates `S.current` and `S.open` (app:545/547), then cancel restores both (338–339). A delayed generic `save()` that reads live `S` can persist these transient selection values. Capture immutable candidates at enqueue and keep view/draft selectors out of a domain snapshot, or use the pre-editor committed selectors.
* `q4Review.draft` (q4-review:719–721) is retained inactive-mode metadata serialized only at final confirmation. Its name does not mean that every instance is an unconfirmed popup leak. Blanket removal would lose previously confirmed alternate-mode raw values; preserve it according to the schema while excluding the currently unconfirmed editor object.
* `emailDomainState` is written at app:605 although validation actually uses the in-memory domain service. Durable projection should omit evidence, pending/error/exposure fields and recompute validation on restore; preserve the email raw string.
* `createMonthlyAllocationDraft.confirm` (allocation-ui:62–72) prepares pure cloned engine state and caches matching payloads; it does not persist or close the session. A failed durable save can retry that prepared candidate while the baseline remains unchanged. The underlying engine explicitly reports `storageCommitPerformed:false` (calculation/allocation:209).

## Minimal central transaction design

Use the storage adapter already owned by the storage implementation. Its agreed API is `createBrowserStorage({localStorage, sessionStorage, locks, key, lockName, now})`, with async `load()`, `commit(payload,{expectedRevision,expectedToken,transactionId,canCommit})`, and `reset({expectedRevision,expectedToken,transactionId,canCommit})`. Results distinguish success, failure, conflict and cancellation. The adapter captures payload at invocation; Web Locks serializes read/check/final-guard/write, and `canCommit` runs immediately before the write.

The application should retain an explicit last durable snapshot/revision, separate working input and each modal draft, and a single persistence coordinator. A confirmation constructs an immutable candidate from the committed data plus its accepted draft. The coordinator passes the captured revision and operation ID, rechecks the editor token in `canCommit`, and publishes the candidate only for an accepted success. On failure/conflict, preserve both the previous durable snapshot and current draft; show the short error in that owner's existing surface. Do not automatically merge another tab's state or retry a conflict with a new revision.

Q2 is the exception to modal presentation, not to persistence ordering. For rapid raw `2 → 20 → 200`, enqueue immediately visible working changes, dispatch one storage operation at a time, and coalesce only not-yet-dispatched input snapshots when appropriate. Choose the next base revision after the previous **own** operation succeeds. Calling the adapter three times immediately with the same revision would produce self-conflicts; applying the first returned `data` to live `S` would lose `200`. Preserve newer working generations when a prior snapshot succeeds. Stop the queue on external conflict or failure, retaining the latest raw; do not silently rebase it onto another tab. Unit changes and explicit confirmations should flush/sequence against this queue rather than racing it.

Transactions that have already completed `setItem` cannot be rolled back by a later Escape without another explicit transaction. Define that linearization boundary. Before it, cancellation invalidates `canCommit`; after it, publish the successful receipt and close consistently. UI-only open/route changes must not manufacture unrelated domain revisions and invalidate monthly edit sessions.

## Independent post-integration checks to run

1. Inject delayed lock and storage failure into every confirmation family: SKU add/change/delete, Q3 save/copy/delete/unlink, Q4 save/delete/once approval. Assert old durable bytes and old confirmed state unchanged, draft/review retained, no success-close, no count increment.
2. Save then immediately Escape/back/cancel while lock is held; release lock and assert zero writes for the cancelled generation. Open another editor before release and ensure no stale close/publish.
3. Double confirm produces one write/revision/commit count. Failure then retry remains possible and commits exactly once.
4. Dispatch Q2 `2/20/200` and qty/price/unit changes without waiting between events. Assert displayed and restored latest raw/exact units, no stale result repaint, and no same-tab false conflict.
5. Open Q1 add/edit while an earlier input save waits; cancel and assert no transient `current/open` enters the domain snapshot. Q3/Q4 cancel and nested Q4 copy then parent-cancel leave durable bytes unchanged.
6. Two tabs read revision N; hold/release locks to force overlap. One accepted write advances N; stale tab stays conflict with its draft intact. Reset tombstone prevents old session and pending other-tab resurrection.
7. Reload/new tab/actual persistent-profile process restart/deploy preserve confirmed data but reevaluate email proof and derived allocation state. Report actual environments separately from mocked storage/JS-context tests.
