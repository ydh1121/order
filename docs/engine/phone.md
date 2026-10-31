# Phone contract 1.0.0

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

These are supported syntax families, not a claim every prefix/subscriber block is allocated. Other domestic types (including 050/080), international +82, short service numbers and extensions return `UNSUPPORTED` when distinguishable. Unsupported is not “invalid under the national numbering plan.” Known incomplete input returns `INCOMPLETE`; empty required/optional input returns `EMPTY` with different reason codes. Letters are not stripped to manufacture a valid number. Spaces, hyphens and a prefix wrapped in parentheses are presentation separators; digit order is invariant.

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

The reducer does not manipulate focus, selection/caret, IME, keyboard events, undo stacks or browser autofill. UX owns those adapters and real OS/browser tests. First-segment changes revalidate the number type and shape; changing a three-segment number to representative or the reverse does not silently discard/create remaining number digits.

## Official reference and limits

- Current supplied source: [전기통신번호관리세칙, 고시 제2021-93호](https://law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000206775), effective 2021-12-07. Metadata was retrieved on 2026-11-01; the web reader did not expose its body/attached allocation tables.
- [Official historical text](https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000095072) exposes 4-digit 010/070 exchange rules and restricted assignment bands. It is historical corroboration, not a current allocation directory.
- [ITU Korea numbering-plan index](https://www.itu.int/oth/T0202000072/en) lists a plan posted 2021-11-08. The linked Word file was downloaded and converted to text locally: its actual communication is dated **2004-03-01**, so the index posting date must not be represented as a current data revision. Document SHA256 is `eff2c0cd010ad6e9e65ade5ed503f56a51a6ac8e1f1cb9d1d28101bf5f5bbad7`. This is historical corroboration only.

`PHONE_DATA_VERSION=kr-number-reference-20261101-partial` deliberately records incomplete reference verification. `evidence.assignment.status` remains `UNKNOWN` and `activation`/`ownership` remain `NOT_CHECKED`, even for syntactically valid `070-1234-5678`. The historical 070 A=2–9 pattern is not silently turned into a current global rejection rule. Full current allocation-data ingestion and real subscriber/owner verification are separate follow-up checks. No actual online telecom lookup was executed.

## Reproduction and independent expectations

`node --test test/engine/phone.test.mjs` runs manually specified canonical forms, explicit/automatic intent, prefix changes, corrupt restoration, scope-sensitive paste, clear/gate handling, shared parser parity and a fixed-seed digit-preservation invariant. Fixture version is `phone-fixtures-1.0.0`. The deterministic corpus uses seed 499 and 500 generated inputs; it is a bounded invariant check, not exhaustive numbering-plan or real keyboard/OS coverage.
