# MSG0579 continuation and return contract

PROJECT=order.ooo / SELF_TRACK=ASTRA_ENGINE_EXECUTION / EXISTING_WO=WO-ORDER-20261101-ASTRA-ENGINE-001 / CONTINUE_MESSAGE=MSG-20261111-0579.

This is a small overlay on the existing [harness](harness-0549.md), not a replacement CLI, skill inventory or state machine. The authoritative directive is [MSG0579](https://drive.google.com/file/d/1mgYMu8wMT9Hu_HvOXrL7OKM02pDOZ6kf/view). Read only the relevant latest sections of the [common Harness](https://docs.google.com/document/d/1MbhK4081yN2A-5SbRgNkdhmdx8gCwXQeEBaN1HKBd-c/edit), [START](https://drive.google.com/file/d/19162YmgCYeyIP4Wgt_fYwORtQPqWYmSq/view) and [own CURRENT](https://drive.google.com/file/d/1p6b303fVYmHH7ekyyVaJE7zK-iaDq8D7/view).

## Lightweight START

- Record latest user decision, retained approval boundaries, actual source/HEAD, last confirmed action and one next action. Reconcile actual branch ancestry without reset or force push.
- Record required rule pointers, approved role folder `12c3k0H1C-PUaLqcMakRBlxComO8zvEB2`, the actually exposed write path and required return files. Official Drive upload/update tools accept absolute local file paths; raw fetch with `download_raw_file=true, include_base64=false` supplies a file reference for byte verification. Do not store signed download URLs in public receipts.
- Use existing `order_harness.py restore` and `resume`, one state directory per concurrent worker. Never run an old action to manufacture a missing receipt. Each fresh action records source/command/receipt/log/evidence hashes and next action; preserve failures, terminal discrepancies and the 4000 output budget.

## Recovered checkpoint limitation

The actual prior checkpoint [Drive ID 1Wokke7mqn4vLVoVIpvZ10WUDPOB_5QCl](https://drive.google.com/file/d/1Wokke7mqn4vLVoVIpvZ10WUDPOB_5QCl/view) was recovered on 2026-11-11: 493,823 bytes, SHA-256 `bf62cf64f3d6b88227540f0ffac9a2814948708fab5adbf59695070002e7cf6f`. Its manifest verifies. The existing CLI restored state only and executed no commands. The previous confirmed action was `ASTRA0549-FINALAC3788D-001`, SUCCEEDED, with no active action.

The archive explicitly omitted raw logs and sanitized its two receipts while retaining original evidence references. `resume` therefore honestly reports two changed receipt hashes and two missing raw logs. The full prior evidence ZIP (78,377,521 bytes, SHA-256 `9debe979c322387b563424cd2e8478519d899f22edad2cdf7dc6983bfe776c8d`) preserves the prior local MATCH report, but not the missing originals. Do not present that historical MATCH as current raw recovery. Keep this limitation in the recovery observation and journal; it does not authorize replay. Fresh authorized delta actions receive new IDs and independently preserved actual receipts/logs.

## QA and evidence boundaries

Reuse [QA_STANDARD v1.0](https://drive.google.com/file/d/1MUpUCqT1bCAXdxU8rIE74w44Y5yNF6IJ/view), the [approved executable shell](https://drive.google.com/file/d/1yNvHGBIdI6alMjDSB1MgwGfpC-bNQZ8F/view) and [reuse package](https://drive.google.com/file/d/1hi3z2EzvRJrLFJzrWKDq4clBp97nCPGC/view). Retain group/variant, state, real mobile/desktop CSS width, reset, real interaction and note export. Both frames begin from the same fixture and remain independently operable. A research adapter is not a new developer dashboard, selected UX or production fixture.

RF-01–06 and QL-01–11 must all be accounted for. Keep actual engine, HTTP/provider, browser/native, delivery, visual selection and integration evidence separate. PC-01–16 came from synthetic expectation research; run against existing owners and keep policy-unresolved outcomes explicit. No invented costs, provider data, stock approval, monthly policy or rejected R3.1 visual integration.

## Lightweight RETURN and durability

1. Finalize actual return files and manifest with version/parent, creator/uploader/verifier and real times. Preserve unique originals and rejected versions; reuse a verified ID for identical bytes.
2. Upload to the approved role folder, then re-read ID, parent and access. Re-download and compare bytes and SHA-256. Native Docs/Sheets instead require revision/changed-range readback.
3. Link history, own CURRENT and own existing Bus row, then re-read. Never write another track's ACK or master review cells.
4. Report DONE/REMAINING, distinct evidence gates, actual opening procedure or NOT_RUN reason, verified count/required count, manifest, one next action and responsible owner. Incomplete preservation is PARTIAL_DELIVERY or DELIVERY_BLOCKED_DRIVE with missing files/hashes, actual failure and resume point; sandbox alone is not formal delivery.
5. Each requested receiving track gets a complete independent block with PROJECT, one TARGET_TRACK, same WO/message, latest source/delta, work scope, retained boundaries, return files and exact unmet conditions. Reference-only tracks get no execution or ACK request. Verify recipient count equals block count.

This overlay grants no new ACL, public sharing, IA publication, design selection, pricing policy, commercial acceptance, unattended loop or quota bypass.
