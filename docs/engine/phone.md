# Phone rules 1.1.0 / MSG0504 browser adapter 1.0.0

MSG-20261101-0499 / E02–E04. Pure ESM; no DOM, contact directory, SMS, call, storage, or current clock.

## Input and one output

`validatePhone(raw)` defaults to completion. Advanced input is `{raw, segments?, intent?, phase?, required?, origin?, field?}`. Supply strings to preserve leading zeroes. `segments`, if supplied, must contain exactly the same digits as `raw`; contradictory parser inputs fail with `PHONE_RAW_SEGMENTS_MISMATCH`.

`intent: {kind:'explicit',middleWidth:3|4}` is only a deliberate move out of the middle segment. Automatic focus uses `{kind:'automatic'}` and cannot create or erase explicit intent. During completion an automatic split may rebalance a valid 9-digit Seoul number from 2-4-3 to 2-3-4 without changing any digit. Explicit 3-digit middle intent never rebalances into a different number. Segment and total upper bounds are checked before completion rebalancing.

Only `VALID` has `normalized: {type,digits,formatted,segments}`. Display, get, serialization, and save must consume this same object. `candidate` is a separate editable value and must never be saved as validated output. All results retain `raw`, field, reason codes, versions and evidence. No Korean customer copy is generated.

| Syntax profile | Segments | Completion digits | Segment maxima |
|---|---|---|---|
| Seoul 02 | 2-3-4 or 2-4-4 | 9 or 10 | 2,4,4 |
| Regional 031/032/033/041/042/043/044/051/052/053/054/055/061/062/063/064 | 3-3-4 or 3-4-4 | 10 or 11 | 3,4,4 |
| Mobile 010 | 3-4-4 | 11 | 3,4,4 |
| Internet 070 | 3-4-4 | 11 | 3,4,4 |
| Representative 15xx/16xx/18xx | 4-4 | 8 | 4,4 |

These are supported syntax families, not a claim every prefix/subscriber block is allocated. MSG0504 preserves the latest UX's `+82` domestic normalization: `+82 10 …`, `+82 010 …`, `+82 (0)10 …`, `+82 2 …` and `+82 70 …` become the corresponding domestic trunk-zero format. The original input remains in `raw`; the normalization is recorded in evidence. A partial `+`, `+8`, or `+82` is `INCOMPLETE`. Other countries, unsupported domestic types (including 050/080), short service numbers and extensions return `UNSUPPORTED` when distinguishable. A representative number is not assumed to become internationally reachable by adding `+82`.

Unsupported is not “invalid under the national numbering plan.” Known incomplete input returns `INCOMPLETE`; empty required/optional input returns `EMPTY` with different reason codes. Letters are not stripped to manufacture a valid number. Spaces, hyphens and a prefix wrapped in parentheses are presentation separators; domestic subscriber digit order is invariant. Double hyphens in a raw restored/pasted value are rejected consistently with MSG0497 UX; internal segmented editing can still represent empty middle/last groups explicitly.

## Restore and edit

```js
import {createPhoneState, editPhone, finalizePhone} from '../../src/engine/validation/phone.mjs';
let state = createPhoneState('02');
state = editPhone(state, {type:'replaceSegment',index:1,text:'234'}).state;
state = editPhone(state, {type:'move',cause:'explicit',from:1,to:2}).state;
state = editPhone(state, {type:'replaceSegment',index:2,text:'5678'}).state;
const result = finalizePhone(state); // VALID, 02-234-5678
```

`editPhone` is a DOM-independent reducer. The caller supplies an explicit `paste.scope`: `segment` replaces only the selected segment; `field` parses the whole phone. A partial `12345678` paste into the last segment is rejected; a whole-field `15881234` paste creates the two-segment representative form. Invalid candidates return `{accepted:false,state:previous,candidate,result}`. Nothing is silently truncated. Reducing an invalid restored string may be accepted as an incomplete repair, but cannot produce a VALID normalized value until all bounds pass.

`createPhoneState` retains `originalRaw` even if corrupt, including `010-1234-12345678`. Explicit user repair changes `raw`/segments without erasing recovery provenance. `{type:'clear',explicit:true}` records a deliberate whole-field clear. Implicit clear is rejected; whole-field empty paste has `explicitClear:false`. The shared `completionGate` allows optional empty completion only with explicit clear. Raw recovery content must remain private when this contract later integrates with real contacts; fixtures here are synthetic.

The pure reducer does not manipulate focus, selection/caret, IME, keyboard events, undo stacks or browser autofill. The MSG0504 browser adapter below owns those operations. First-segment changes revalidate the number type and shape; changing a three-segment number to representative or the reverse does not silently discard/create remaining number digits.

## MSG0504 browser adapter and integration

`src/engine/adapters/phone-browser.mjs` imports only browser-compatible modules. `createOrderPhoneAdapter()` provides the existing `OrderPhone` interface: `parse`, `mount`, `get`, `set`, and `instance`. Mount creates the same existing shell/part/separator classes and preserves the e13f event ownership for cursor, selection, explicit middle intent, automatic focus, paste/drop, composition, fallback input, undo and clear. The e13f source is the 489,401-byte file with SHA256 `e13f200945b9277e986b1994fc4f91998fc68f18d1bcbc0b69cb8dc6dd54d6a8`; it was read without modifying its HTML/CSS.

The old independent phone regex/parser is replaced by `validatePhone`. Browser `parse` returns legacy `valid/kind/prefix/parts/limits/formatted` fields plus the exact `contract` envelope. Each mounted control exposes `contract()`, `projection(options)`, and `snapshot()` in addition to the existing interface. Snapshot preserves original restoration input separately from editable/normalized display and returns caret/selection/intent/composition state. A rejected insertion restores the selection and prior digits.

`projectPhone` derives field completeness, parent completeness, badge count and save permission from the same contract. `editing:true` is neutral, contributes no red error/badge, and does not authorize saving incomplete data. `errorExposed:true` shows a confirmed non-complete field error only outside editing. Optional initial-empty data is accepted through the explicit `initialEmpty` flag; an automatic replacement of previously nonempty data with empty is not treated as a deliberate user clear. Mounted controls derive this distinction from their source snapshot and explicit delete action. No engine reason codes are converted to customer-facing text.

```js
import {createOrderPhoneAdapter} from '../../src/engine/adapters/phone-browser.mjs';
const OrderPhone = createOrderPhoneAdapter();
const control = OrderPhone.mount(document.querySelector('#site-contact-phone'));
control.set('+82 10 2345 6789');
control.commit();
const projection = control.projection({editing:false,errorExposed:false});
// Same projection feeds field/parent/badge/CTA; save reads normalized only when saveAllowed.
```

This module is prepared for root integration after the UX handoff. Extracting the adapter does not by itself connect the product page or establish final browser/OS acceptance.

## Official reference and limits

- Current supplied source: [전기통신번호관리세칙, 고시 제2021-93호](https://law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000206775), effective 2021-12-07. Metadata was retrieved on 2026-11-01; the web reader did not expose its body/attached allocation tables.
- [Official historical text](https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000095072) exposes 4-digit 010/070 exchange rules and restricted assignment bands. It is historical corroboration, not a current allocation directory.
- [ITU Korea numbering-plan index](https://www.itu.int/oth/T0202000072/en) lists a plan posted 2021-11-08. The linked Word file was downloaded and converted to text locally: its actual communication is dated **2004-03-01**, so the index posting date must not be represented as a current data revision. Document SHA256 is `eff2c0cd010ad6e9e65ade5ed503f56a51a6ac8e1f1cb9d1d28101bf5f5bbad7`. This is historical corroboration only.

`PHONE_DATA_VERSION=kr-number-reference-20261101-partial` deliberately records incomplete reference verification. `evidence.assignment.status` remains `UNKNOWN` and `activation`/`ownership` remain `NOT_CHECKED`, even for syntactically valid `070-1234-5678`. The historical 070 A=2–9 pattern is not silently turned into a current global rejection rule. Full current allocation-data ingestion and real subscriber/owner verification are separate follow-up checks. No actual online telecom lookup was executed.

## Reproduction and independent expectations

`node --test test/engine/phone.test.mjs test/engine/phone-browser.test.mjs test/engine/phone-browser-dom.test.mjs` runs manually specified canonical forms, explicit/automatic intent, prefix changes, corrupt restoration, scope-sensitive paste, clear/gate handling, shared parser parity, +82 preservation and a fixed-seed digit-preservation invariant. Fixture version is `phone-fixtures-1.1.0`. The deterministic corpus uses seed 499 and 500 generated domestic inputs; it is a bounded invariant check, not exhaustive numbering-plan or real keyboard/OS coverage.

The five `DOM MOCK` cases use a bounded event/selection harness, explicitly **not** a real browser. The separate executable `test/engine/phone-browser.smoke.mjs` uses actual Playwright/Chromium and local HTTP. Supply `PLAYWRIGHT_MODULE` and `CHROME_PATH` only when modules/executable are not on the default path. On this MSG0504 run a Chromium executable was found and attempted, but startup failed with `process_singleton_posix.cc:297 socket() failed: Operation not permitted (1)`. Therefore actual Chromium interaction is **BLOCKED**, not PASS. Windows, iPhone, HTTPS hosting and real phone activation/ownership checks remain NOT_RUN.
