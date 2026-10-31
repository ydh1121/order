# MSG0504 R10 읽기 전용 감사 · e13f 인수 지도

이 기록은 MSG0504 §2.3의 **정적 목록과 연결 위치 조사**다. UX 수정 완료, 브라우저 스타일 수락, 공통화 완료, 성능 개선을 주장하지 않는다. `context/contract-0504.md`와 저장소 `AGENTS.md`를 실제 읽었다. 아래 줄 번호는 모두 정확한 MSG0497 e13f HTML 기준이며, 후속 UX 수정본을 받으면 새 해시에서 다시 매핑해야 한다.

| 인수 항목 | 실제 확인 |
|---|---|
| UX 원본 | [Drive HTML](https://drive.google.com/file/d/1e6BuwKzqiVBu6F2VDzFqOpKeVtE58IUD/view), 489,401 bytes |
| SHA-256 | `e13f200945b9277e986b1994fc4f91998fc68f18d1bcbc0b69cb8dc6dd54d6a8` |
| 원본 변경 | 없음. 감사 parser의 메모리 안에서만 아래 명시된 복구 사용 |
| UX 인계 조회 | [Message Bus](https://docs.google.com/spreadsheets/d/1J5-pZ4poeSmyKpO7vUOIS-tWa1t0LmBQb-wGd6SVFjU/edit), MESSAGES row 510 MSG0505 `PENDING`, ACK/APPLIED/수정본 링크 없음 |
| 조회 범위 | 최초 MESSAGES A1:Z650 / STATUS_EVENTS A1:J650, 재조회 MESSAGES A500:Z550 및 Drive `MSG0505`, `ORDER MSG0505` 상위 10개. 이 범위에서 새 UX 수정본·해시는 찾지 못함. 전역 부재 주장은 아님 |
| 소유권 | 이 감사는 타 트랙 ACK·Drive·Bus 쓰기 0회. U1–U4 HTML/CSS 원문은 UX 소유; 정확한 수정본 해시 인계 후 root가 통합 |

## 실행과 측정

새 감사 도구: `scripts/engine/audit-r10-0504.mjs`. PostCSS 8.5.29의 CSS AST와 JSDOM 26.1.0의 정적 HTML parser를 사용했다. JavaScript 함수·이벤트 위치는 어휘 검색이며 JS AST 분석으로 표현하지 않는다. JSDOM에 스크립트 실행·외부 resource 로딩을 켜지 않았다. Node v24.22.1, Linux에서 실행했다.

실제 실행 명령(작업 디렉터리 `order`):

```sh
node scripts/engine/audit-r10-0504.mjs \
  ../context/MSG0497-e13f.html ../evidence/r10-audit-0504.json \
  /workspace/scratch/f9beae23ea4e/ComeBackHome/node_modules/postcss \
  /workspace/scratch/d34e11a69a71/.planning_next/qa-dom/node_modules/jsdom
```

마지막 두 인자는 설치된 감사용 parser 모듈 경로다. 제품 runtime dependency가 아니며 공개 build에 포함하지 않는다. 다른 환경에서는 해당 버전을 별도 감사 디렉터리에 설치하고 경로를 전달한다. 입력 해시가 e13f와 다르면 도구는 실패하고 결과를 쓰지 않는다.

**원문 strict CSS parse는 FAIL**: HTML 203행의 고립된 `}`에서 `Unexpected }`가 발생했다. 도구는 그 한 글자만 메모리에서 같은 길이 공백으로 치환한 뒤 AST를 생성하며 모든 줄 번호를 유지한다. 아래 CSS 수치는 이 명시적 회복 AST 기준이다. JSDOM 원문 파서도 `Could not parse CSS stylesheet`를 기록했다. 두 parser의 오류가 실제 브라우저 전체 CSS 무효를 증명하지는 않는다. 브라우저 CSS 오류 복구와 실제 cascade는 별도로 확인해야 한다.

| 항목 | 원본 raw bytes | gzip level 9 bytes |
|---|---:|---:|
| HTML 전체 | 489,401 | 122,259 |
| style 내용, 1블록 | 169,734 | 30,767 |
| script 내용, 2블록을 LF로 연결 | 303,453 | 87,730 |

독립 gzip 크기는 합산해 배포 크기로 사용하지 않는다. HTTP 압축·번들·캐시·전송 비용을 실측한 것이 아니다.

| 정적 항목 | 측정값 | 해석 제한 |
|---|---:|---|
| CSS rules / declarations / at-rules | 1,511 / 4,738 / 72 | 203행 회복 AST |
| 정확한 중복 선언 그룹 / 추가 출현 수 | 34 / 35 | 동일 at-rule 문맥·selector 전체 문자열·property·value·important만 묶음 |
| 동일 selector/property에서 다른 값 그룹 | 76 | override 후보. 실제 가려진 규칙 수·삭제 가능 수 아님 |
| 동일 selector 반복 그룹 | 89 | intentional state/viewport override 여부 확인 필요 |
| custom property 이름 | 152 | selector/viewport별 정의를 보존 |
| 빈 media/supports | 6 | 547, 555, 556, 1434, 1474, 1504행 |
| CSS class 이름 | 497 | 정적 HTML 참조 82, JS 문자열 참조 295; 두 집합은 겹침 |
| 두 참조에서 미발견한 CSS class | 174 | 동적 조합·브라우저 상태·향후 렌더 경로 존재 가능, dead code 판정 금지 |
| 정적 elements / buttons / inputs / dialogs | 219 / 34 / 4 / 6 | 초기 HTML에만 해당, 실행 후 DOM 수 아님 |
| addEventListener / on-event 대입 소스 위치 | 83 / 34 | 반복·mount·조건부 등록을 실행하지 않았으므로 설치 listener 수 아님 |

전체 selector/declaration/token/함수/event/storage 위치와 parser 오류는 `../evidence/r10-audit-0504.json`, 인계 조회 원문은 `../evidence/r10-handoff-search-0504.json`에 기록했다. 실행 후 재실행 결과의 바이트 동등성과 원본 해시 보존, 잘못된 입력 해시 거부를 확인한다. 실제 명령 결과는 `../evidence/r10-audit-0504-checks.log`에 기록한다.

## 실사용 생성·variant·이벤트 소유 지도

아래는 정적 HTML 또는 JS renderer/callsite로 소비가 확인된 경로다. 특정 시점 DOM에 없다고 미사용 처리하지 않는다.

| 구성 | 생성/공통 소유자(행) | variant·소비자 | 이벤트/상태 소유자(행) |
|---|---|---|---|
| 선택 버튼 | `pickGroup` 2446, `choice` 3318, `.ui-choice` 735부터 | Q1 pill/tile, Q4 mode; selected/invalid/disabled, weekday는 별도 의미 | Q1 `data-pick` 위임, Q4 dialog click 3871; 각 domain이 선택값 소유 |
| 취소/확인/삭제 | `.ui-transaction-action` 755–764, 정적 Q1 1624–1625/Q4 1633·1636 | neutral/primary/danger, hover/active/focus-visible/disabled | Q1 bind 2877·2880, Q4 shared shell 3927; 취소가 초기 focus 받는 상황 별도 비교 |
| 텍스트 동작/복사 | 첫 `CODE1_UI.textAction` 2085, `.ui-copy-action`; Q3 `renderAddress` 2718 | edit/delete/unlink/copy; danger의 의미 유지 | `#q3-sites` click 2941부터; Q4 saved allocation 위임 |
| 아코디언 | `OrderAccordionView` 1937, `OrderDisclosure` 1952 | `ui-completion` empty/draft-valid/saved-valid/invalid, expanded 별도 | main `render` 2655, Q3 expanded Map 2717, Q4 body Map 2732, editor `acc` 3315·`setOpen` 3709 |
| 입력 | Q2 `renderQ2` 2681, Q3 editor 1638, Q4 `quantity` 3316 | qty/price, phone/email, monthly/base/min/max/once | Q2 input 2858, Q3 input/custom events 2938–2940, Q4 input 3915 |
| 전화 입력 | `OrderPhone` 1699, `mount` 2906 | 자동/명시적 02 구역, prefix, paste/drop/IME/복원/+82 | shell beforeinput/paste/composition/input/focusout 1774–1799; `order-phone-input` 2939 |
| 이메일 입력 | `OrderEmail` 1804, `OrderEmailDomain` 1831, `OrderEmailUI` 1873 | syntax/route/pending/unknown; suggestion과 허용 판정 구분 | input lifecycle 1896–1905, `order-email-state` 2940, `OrderEmailLifecycle` 3247 |
| dropdown/날짜 | `dropdown` 3321, `renderCalendar` 3557, `OrderDatePolicy` 2064 | standard/selection-dropdown/editable; blank/number/last, weekday/weekend/holiday | 월 beforeinput/input/blur 3855–3867, dialog click/change/key 3871–3921 |
| 팝업 shell | `OrderModalShell` 1982, `OrderCopyDialog` 1967 | 일반 editor/transaction/copy, backdrop/focus/scroll | shared bind 1982부터; main은 transaction, Q4는 draft 소유 |
| 연락처 비교 | `openContactCopy` 2952, Q4 `requestCopy` 3434 | 현재/변경, 다중 대상, stale guard | 기존 contact confirm flow와 Q4 `applyCopy` 3487 별개; UX U4 인계 전 구조 변경 금지 |
| 결과 수치 | `renderResult` 2801, `Q4ResultSummary` 3998 | missing/complete, monthly/once/both | `refreshResultsOnly` 4004는 같은 mode의 숫자 노드만 patch; font/resize 측정 4010부터 |

두 IIFE에 `CODE1_UI`가 각각 존재한다(2082, 3314). 둘 다 `OrderAccordionView`를 소비한다. 이름이 같다는 이유로 단순 병합하지 말고, 이미 공유된 `OrderIcons`/`OrderAccordionView`/`OrderDisclosure`/`OrderModalShell`/`OrderCopyDialog`의 공통 표현만 확장한다. 도메인 state와 commit은 각 owner에 남긴다.

## 토큰과 CSS 감사 후보

| 역할 | 기존 토큰·위치 | 유지할 의미 |
|---|---|---|
| 기본 정보/브랜드 | `--ink`, `--muted`, `--text-primary`, `--text-secondary`, `--blue:#315dde` 5행 | blue는 선택/동작, neutral은 정보; 비슷한 값 전체 일괄 대체 금지 |
| 오류 | `--ui-danger:#d92d48` 854행, `--ui-badge-bg` 5행 | invalid와 편집중 blocker 분리; 주말 색과 역할 구분 |
| 완료 | `--stage-done-stroke`, `--stage-done-icon` 491행 | 완료는 별도 의미, 현재 blue와 값이 같아도 semantic alias 유지 가능 |
| border/control | `--ui-border:#cbd5dc` 855행, `--ui-control-height/radius` 856행 | focus/error/disabled border의 상태 보존 |
| 선택 | `--ui-choice-*` 722–726행 | selected/hover/disabled 구별 |
| transaction | `--ui-transaction-*` 727행 | neutral/primary/danger 및 danger hover/active 토큰 유지 |
| disabled | `--ui-disabled-bg/color/border` 727행 | opacity만 바꾸지 않는 기존 상태 의미 |
| typography/spacing | `--type-*`/weight 5행, `--ui-field-*` 729–732행 | mobile field-section gap 767px 경계와 dependent/top/sku variants 768–771행 |

확인된 후보:

1. 203행 고립된 `}`: 원문 strict parse 실패. UX 인계 후 문법 정리 대상으로 잡되 실제 browser cascade 전후를 먼저 기록한다.
2. `var(--ui-danger)30` 590행, `var(--ui-danger)29` 637행: var 문자열 뒤에 hex alpha를 붙인 invalid color 값. 색 역할에 맞는 기존 토큰 또는 검토된 `color-mix` 표현으로 바꾸는 시점에 실제 error/focus 상태를 비교한다.
3. `#315dde` 28회, `#d92d48` 26회, `#cbd5dc` 7회가 CSS 선언 값에 출현한다(토큰 정의 포함). 해당 값이 brand/error/border의 같은 역할인지 확인한 소비자만 token으로 이관한다. `#fff` 58회 자체는 삭제 지표가 아니다.
4. `.header,.main` width 21/160행, `.address-selected` background 78/145행처럼 exact 중복이 있다. `.q4-regular-dialog .q4-combo-trigger` border 622/905행처럼 의도적으로 뒤 값이 다른 후보도 있다. 전체 JSON은 문맥·important를 보존한다.
5. weekday/calendar 규칙은 일요일/공휴일/대체공휴일 838–840행과 선택/disabled 상태를 함께 검사해야 한다. 모든 빨강/파랑을 한 상태로 합치지 않는다.
6. 월 dropdown의 `.qa-repeat-section .qa-inline-pair .qa-combo-trigger::before` 784행과 `.qa-month-value:has(input:placeholder-shown)` 1113행의 grid span이 정적 원인 후보다. 실제 줄 배치·rect·computed style는 NOT_RUN. U3를 임의 translateY 보정하지 않는다.
7. Q1 취소와 Q4 취소에는 공통 transaction class가 이미 있다(1625/1633행). U2는 같은 focus/hover/default/parent 간격으로 비교해야 하며 class 부착으로 완료 처리할 수 없다.

## 엔진·월 배분의 정확한 연결점

| 경계 | 기존 함수/DOM | 연결 시 지켜야 할 내용 |
|---|---|---|
| 저장 domain | `blank`/`S` 2308–2309, `blankAllocation` 2325 | SKU `line.id`, site `locationId`, allocation `id` 안정 ID 유지; 표시 index는 adapter에서만 사용 |
| Q2 전체 월 수량 | `renderQ2` 2681, `[data-line-qty]`, `#qty-<id>`, input 2858 | pack·단위와 exact integer 원문을 engine으로 전달. Q2 변경 시 saved manual 값 유지와 derived 재계산 구분 |
| Q4 draft 초기화 | `beginQ4Context` 3194, `initializeFromRegular` 3943 | committed snapshot clone. single site는 Q2 total 재사용; 복수는 monthly 값/provenance 별도. 현재 코드에 monthly provenance 없음 |
| 월 입력 | `quantity(i,'monthly',...)` 3316, `#q0394-<i>-monthly`, `[data-qty="<i>:monthly"]` | i를 `regularContext.allocations[i].locationId`로 매핑. 월 총량/현재 site/다른 site/raw/manual 또는 derived를 전달 |
| 입력 갱신 | Q4 dialog input 3915, `refreshStatus`, `refreshResultsOnly` 4004 | engine 잔여/최대/unknown을 표시. 활성 input·커서와 result card identity를 보존. 여러 blank에 75/75 자동 분배 금지 |
| field/status gate | `fields` 3294, `status` 3295, `q4QuantityInvalid` 4059, `syncRegularQuantityErrors` 4064 | same allocation result를 field/parent/CTA에 사용; invalid 다른 값이 있으면 guessed remainder 금지 |
| serializer | `serializedAllocations` 3963; monthly assignment 3970; `q4Review.draft.values` 3974 | raw manual/derived provenance와 derivation fingerprint를 보존. 힌트만 있는 값을 saved/completed로 기록 금지 |
| commit | `validateForSave` 3978, `saveRegularDraft` 3986, `q4ReviewCommit` 3201 | parent signature와 중복 commit guard 보존. commit에 새 배분검사를 재실행해 오래된 힌트/stale Q2 차단 |
| cross-stage 검증 | `CODE1_ORDER_VALIDATION` 2114, `q4ReviewAllocationIssues` 3161, `q4ReviewVerdict` 3184 | **현 wrapper가 version0460 line의 legacy q4 오류를 assignment 외에 제거한다(3188).** 월 합계 engine 오류를 새 verdict에도 연결해야 함. editor만 검사하면 commit/복원 gate가 달라질 수 있음 |
| 저장/복원 | `ensureMigration` 2376, sessionStorage restore 2389, `save` 2390 | `order_v015R2_draft` 읽기/쓰기, R1 fallback. 명시 저장 성공만 committed 변경; 복원 시 schema/provenance와 검증 재수행 |
| summary | `renderDelivery` 2743, `[data-q4-summary-fields="monthly qty min max"]`; Q3/Q4 completion 2538/2552 | 같은 결과 계약으로 완료·오류를 paint. editing blocker는 별도 U1 state |

중복/구 정책을 이관할 후보도 확인했다. `CODE1_UI.sumPlan` 2089는 blank 개수로 균등 분할한 `최대 N판` 힌트를 만든다. 이 파일에는 선언/return export 외 직접 호출 문자열이 발견되지 않았다. 따라서 현재 실행 경로라고 주장하지 않으며 모든 소비자 조사 후 제거 여부를 결정한다. `q4InvalidateSiteDemand` 3036은 Q2 변경 때 호출되며 per-delivery `qtySource`를 검사한다. 이를 monthly provenance로 오인하면 안 된다.

월 배분은 기존 `q4Visits` 3068, `OrderRegularQ4Bridge.forecast` 3225, `monthlyResultData` 3988과 분리한다. `q4Visits`는 4주 환산을 사용하고 forecast에는 0.8 미달 기준도 있다. `monthlyComparisonBasis` 2343은 실제 calendar month의 weekday count를 사용한다. 두 경로가 다른 의미를 갖는 상태에서 배분 engine의 exact 합계를 회당납품 forecast로 조용히 치환하지 않는다. ONCE는 기존 confirm fingerprint/commit 흐름을 보존한다.

전화/이메일은 `OrderPhone`의 DOM/cursor 이벤트 owner를 보존한 채 validator/serializer를 adapter로 이관한다. `OrderSiteContract` 1912는 field completion 소비점, `q3ReadInputs` 2898/`saveSite` 2920는 저장 gate, `OrderEmailLifecycle` 3247는 복원·TTL 재검증 owner다. UI event와 DNS callback 양쪽에서 동일 target/revision/result를 사용하고, 닫힌 draft를 늦은 응답으로 다시 paint하지 않는다.

## 최소 파일 경계와 public build

권장 경계는 5개 역할이다. 기존 `src/engine` 순수 코어를 유지하고, browser entry가 Node 전용 barrel을 거치지 않게 한다. DOM 없는 state/serialization 계약, browser DNS/IDNA/clock/reference adapter, 기존 공통 UI owners, page assembly를 분리한다. 파일 수 목표나 대형 재작성은 두지 않는다. 우선 원본 CSS 한 파일과 기존 두 IIFE의 로딩 순서를 그대로 보존해 인수하고, 한 소비자 묶음씩 이관한 뒤 legacy를 제거한다.

공개 output은 명시 allowlist로 `dist/index.html`, page CSS/JS, 도달 가능한 browser engine graph, 검증된 IANA reference/manifest 등만 생성하는 작은 build가 최소안이다. 저장소 루트를 Pages output으로 지정하지 않는다. build 시 Node adapter, `node:*`, `Buffer`, QA globals, fixtures/evidence/tests/보고서 및 실제 비공개자료 유입을 검사한다. build manifest에 input UX hash·engine/contract version·output hash를 고정한다.

e13f에는 `SAMPLE_MODE`, `DEFAULT_SCENARIO` 2783–2785와 `window.__orderLowfiQA` 3151이 남아 있다. sample 가격은 현재 local/file origin에 제한되어도 공개 소스에 포함되므로 production input/output에서 제외할 대상이다. 제품에 없는 공급가를 0 또는 sample 값으로 대체하지 않는다. `calcExample` 2787/`renderResult` 2801은 공급 자료 없음 상태로 연결하고 기존 quote API와 exact calculator의 계약을 adapter에서 명시한다. QA 주소 비교 HTML은 public output에 넣지 않는다.

## 남은 검증과 수락 상태

| 항목 | 이 감사 상태 | 통합 후 필요한 근거 |
|---|---|---|
| e13f hash/bytes | 확인 | 새 UX 인계 hash와 commit 고정 |
| CSS inventory | 회복 AST 완료; 원문 strict parse FAIL | 인계 소스 문법 정리와 actual cascade |
| I09 static owners/tokens | 목록 완료 | default/hover/active/focus-visible/disabled, blank/editing/valid/error, PC/mobile의 actual computed style와 같은 상태 screenshot |
| I10 bytes/source composition | baseline 완료 | actual public bundle 구성, 실행 DOM/listener 수, input 처리/불필요한 DNS 조회의 전후 같은 시나리오 측정 |
| runtime/browser/OS/DNS | NOT_RUN | mock/DOM 검사와 실제 HTTPS root/browser/OS 결과 별도 기록 |
| UX U1–U4 수락 | PENDING external handoff | UX 소유 수정본·변경 목록·해시, 고정 통합 commit에서 거래 검수 |
| performance gain | 주장 없음 | 같은 기기/viewport/data/state의 전후 실행 증거 |

기존 MSG0499 비교는 중간 eab019 해시에 대한 별도 VM 증거다. e13f 또는 후속 UX 수정본의 브라우저 PASS로 재사용하지 않는다.
