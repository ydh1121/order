# MSG0549 실행 진행 기록 — C55·구조·스킬·하네스

2026-11-05 KST. 기존 WO-ORDER-20261101-ASTRA-ENGINE-001 / ASTRA_ENGINE_EXECUTION / ydh1121/order에서 진행한다. 기준 main은 c3800a2dacec92f9a6a8b99345e34eee151ddd84다. 아래는 담당자 보고와 실제 소스·검사 파일을 연결한 **로컬 중간 기록**이며, 수정 내용이 그 기준 커밋에 이미 포함됐다는 뜻은 아니다. 최종 commit·동일 source CI·브라우저·게시 결과는 root가 후속 추가한다.

[누적 합본](https://drive.google.com/file/d/1uI3qTXj8byhzH2eUToeWrZmCABiekllz/view)의 C55-01~20, 구조/공통 owner/스타일, 기존 5스킬, checkpoint/run/resume/durable 연결을 포함한다. 이전 MSG0547/0548 전달 HOLD는 대체됐다. PENDING-29 회사별 피팅만 이번 묶음에서 DEFERRED다. QA9/D1R6/S2 승인, G6=USER_APPROVED_QA_SCOPED, G11=USER_APPROVED_QA_CANONICAL_VERIFY_PENDING, LOWFI=NONE, P26=IN_REVIEW를 유지한다. IA·상용·미결 정책의 일괄 승인이 아니다.

공식 QA 실행 D/수정 후 근거 G는 Astra 소유이며 MASTER 독립 감사 H와 기존 실패 이력을 보존한다. 본 문서 작성 시 공식 C55 D/G는 NOT_RUN/공란이고 root 최종 근거 전 승격하지 않는다.

## 현재 실행 근거와 한계

- Root 최신 로컬 보고: Node 677/677, build PASS, 주소 LAB 7/7. 최종 commit CI와 canonical/실제 제공자 검증은 아직 PENDING이다. 기존 672/672는 앞선 중간 실행으로 보존한다.
- 주소 고립 상태의 address-final-targeted-03은 Node 51/51, 주소 결함 주입 4개 탐지를 관측했다. 실 provider 호출은 수행하지 않았다.
- 날짜 date-finalgate-005는 Node 35/35. 앞선 date-binding-002의 합성 DOM fixture 누락 실패도 보존했다.
- Q4는 독립 순수 계약 RED→GREEN, 실제 사용 함수 VM, 3개 결함 주입 및 당시 기존 회귀 59/59를 보고했다. 이후 연결 수정이 있어 이 숫자를 최신 전체 source PASS로 재사용하지 않는다.
- 구조는 Node 8/8, 7개 연결 결함 반례, 정적 map 오류 0. computed-style/geometry browser 비교는 작성·문법 검사까지이며 실행은 후속 CI 대상이다.

검사 수는 중복되어 합산하지 않는다. 합성 provider, DOM mock, 실제 함수 VM, Node, 정적 분석, browser, 실제 provider 증거를 구분한다. MSG0549 제품 push·PR 병합·Production 변경은 작성 시 아직 없다. Drive checkpoint와 본인 기록 쓰기는 실제 수행했다.

## C55 요구·사용처·검사 연결

Node 파일은 test/engine/, browser 파일은 test/browser/ 기준이다. 관측은 해당 담당 실행 시점에 한정하며 최종 공식 상태를 대신하지 않는다.

| ID | 제품 owner와 독립 기대값 | 검사·현재 근거 | 남은 경계 |
|---|---|---|---|
| C55-01 | functions/api/address/search.js, address-service: 같은 입력에서 상호3사례와 도로명 | c55-address.test.mjs 합성4사례, c55-address.smoke.mjs | 실제 Kakao/정본 |
| C55-02 | address-contract/service/ui: 장소 ID·이름·주소, 선택1건만 우편주소 resolve, 동일 건물 매장 분리 | 선택 ID/모호한 주소/이동 매장/부모 저장 Node·DOM; child0/parent1/reload smoke | 실제 browser/provider |
| C55-03 | address-ui: 성공 페이지만 전진, 기존 목록 유지, provider continuation, 실패한 페이지 재시도 | mock [1,2,3,3], 필터 후 빈 페이지, 관련 결함 주입 | 늦은 성공응답/실제 화면 |
| C55-04 | approved-schedule: 30일 월 M=30×n,Q=7 → 주 n회, n1~7 | c55-q4-contract 독립 항등식, c55-q4.smoke 7주기 | 표시 반올림을 허용 판정에 재사용 금지 |
| C55-05 | approved-schedule/Q4: 67/15·100/14·600/300·600/227; 추천·허용·표시·명시 협의 구분 | contract/consumer, 명시 협의 유지와 자동 fallback 구분 | 새로운 근접 허용 오차 미승인 |
| C55-06 | Q4 수량/월간 기억: M 편집은 Q 보존, 매월 왕복 복원 | contract/consumers에서 사업장별 Q/주기 기억 | 실제 저장/재열기/전환 |
| C55-07 | selectedOption/repeatForSite/serializedAllocations: 일괄 매월 Q100/67 | 실제 handler VM, 첫 사업장만 수정하는 반례, 320/375/1440 smoke | bulk save/reload/restore |
| C55-08 | q4-planning/monthlyResultData: 월수요와 해당달 일정량 구분, ONCE 별도 | 기준월·반영 사업장·누락 이유 consumer | 167판 중심값 의미 변경 미승인 |
| C55-09 | calendar-forecast/repeatVisitPlan: 11/30 시작 이전 주간 방문 제외 | 독립 날짜목록·주간 시작 무시 mutant | 화면의 같은 기준월 |
| C55-10 | nominalQuantity/repeatVisitPlan: 다음달 시작은 이번달 알려진0 | resolved/visits0/0범위, future start+부분요일 계약 | 0과 미확정 표시 구분 |
| C55-11 | Q4 summary: 주4회·희망3요일은 유효하고 잔여일정 미정 | contract/consumer, 3선택 보존, smoke | 임의4번째요일 금지, 실제 copy fit |
| C55-12 | sumNominalByReference/Q4: 동일 표시 기준월, 서로 다른 달 합계 금지 | 그룹값 유지·합계null·summary consumer | 저장복원/browser 기준월 |
| C55-13 | order-date/q4-date/date-field: 오전·오후·내일·근접·주말·신정 공통 안내 | date-0549/date-field-0549 실제 binding, c55-date.smoke | 본문/재개봉 실제 화면 |
| C55-14 | 같은 날짜 owner: 완성3333/22/33은 mode 범위 즉시 보정, 첫 자릿수 보존 | normalizer·input handler·저장 gate | 실제 IME/포커스/browser |
| C55-15 | FIXED D1R6/ONCE_LEGACY 옵션, ONCE 선택항목과 raw 저장값 순수조회 | optional·동결값·restore/repaint zero notification·완료 gate | 기간 통합 미승인. 값 보존과 유효 판정은 다름 |
| C55-16 | 수량/요약: Q28,min10,max60 등 넓은 유효범위 | contract/consumer, visits×min..max | 수요·대표Q·횟수·일정량 혼용 금지 |
| C55-17 | Q4/주입 bridge/storage: 개별·일괄·모드전환·취소·저장·복원 | per-site memory VM, 기존 저장회귀, Q4/date/address smoke | 작성조합의 실제 browser; 미실행 PASS 금지 |
| C55-18 | 승인 공통 UI/styles, 실제 누락사유 문구 | 동일 CSS 사본 제거·동일 pair 선언 통합, structure smoke | 320/375/PC·긴 라벨·상태·200% 확대 |
| C55-19 | 독립 기대값·필수 사용처·읽기 순수성·반례 | 주소4/Q4 3/구조7 mutant는 각각 범위 한정; 동결초안/Acorn owner 검사 | 정적 그림·개수로 전체 branch/UI 수락 대체 금지 |
| C55-20 | 동일main CI→canonical identity→소수 실제 검색·선택·부모저장·복원 | 아직 NOT_RUN; MSG0543 도로명1건은 별도 이력 | 최종 CI/배포/provider 및 미관측 transport/과금 구분 |

## 구조·저장·정책 보존

[구조·스타일 문서](structure-0549.md)는 main→app→Q4 주입 경로, 공통 날짜/검증/초안/저장 owner와 window 호환 면을 연결한다. check-structure-0549.mjs는 새 순환, engine→UI 역의존, 공통 호출 단절, Q4 window 저장 회귀를 검사한다. 정적 map이 임의 동적 alias·browser 초기화·계산 정답을 완전 증명하지는 않는다.

완료·dirty·요약은 동결 초안을 변경하지 않는 조회다. 변경은 명시적 입력·선택·저장에서 수행한다. 사업장별 기억은 기존 activeRepeat payload에 보존한다. schema8의 명시 협의 표시는 이전 schema1~7에 없던 의도를 소급 생성하지 않는다.

ONCE는 기존 오늘~2100-12-31 범위와 날짜 선택 조건, FIXED는 승인 D1R6 범위를 옵션으로 분리한다. 과거/잘못된 저장 날짜를 읽기만으로 바꾸지 않으며, 보존을 유효 판정으로 혼동하지 않는다. 공급자 정보 없이 주말·공휴일을 금지하지 않는다. 167 중심값, 근접 주기 허용 오차, ONCE 기간 통합은 미승인 정책으로 남긴다.

## 기존 5스킬 적용

보관·읽음·source 적용·단위 검증·실제 화면 검수·CI 강제는 다른 상태다. 승인 UI와 공통 owner가 외부 예시 값보다 우선한다.

| 고정 원문 | 적용한 책임 | 실제 근거·제한 |
|---|---|---|
| better-layout 60bf140e43c98b248e6594487384ec967e89d98a | 기존 그룹·정렬·간격·읽기 순서, 날짜·주소 후보·paired field | source grouping/기존 토큰 보존; 실제 폭·zoom 후속 |
| MIFB 35545ea1512ad59fa463e6b1f95ca9c052981fe6 | typography·surfaces·상태·아이콘·동적 숫자·입력 | 기존 CSS/currentColor/tabular-nums/44px, 새 반복모션 없음; native focus/motion 후속 |
| Ponytail 96608e078b2d | owner/호출자 조사→책임 단위 변경→연결 diff | constructor/validation·window 의존·순수조회·반례; CLI/hook 설치 아님 |
| Archify a4065941f12b | 실제 규칙→owner→사용처→검사 | 구조 문서 Mermaid/Acorn map; runtime 설치·그림만으로 계산 수락 아님 |
| Cloudflare security-audit c1c8a8c1471069fb0e188eeaff69b8e8db6564a8 | 고정 API host/path, 입력/DOM/provenance/저장/secret 경계 | guidance·source review와 합성 회귀; 운영 설정/full audit 인증 아님 |

세부 적용은 [구조 문서](structure-0549.md), [주소 계약](../address-provider.md), 실행방 ADDRESS_EVIDENCE.md·DATE_IMPLEMENTATION_0549.md·DECISIONS_AND_EVIDENCE.md에 있다. 실행방 evidence와 외부 원문 전체·폰트·브랜드 자산을 제품 번들에 포함하지 않는다.

## 하네스·실제 지속 저장

[하네스 운영 문서](harness-0549.md)의 명시적 wrapper를 실제 사용했다. 원본 CLI 고정본을 유지하며 host adapter가 전후 source/receipt/log hash, stale 증거, 프로세스 생존, export 경계를 보완한다.

| 단계 | 관측 |
|---|---|
| 첫 owner bridge | START 85,046B/SHA83ff43b194973eacb950a0e2000706fd7523af3a6d6d200e4348dcd3260adea6; tools/docs10+정제 상태, 실제 업로드/raw 검증 |
| 초기 자동 callback001 | 단일 code-mode 호출 command→export→Drive→raw 성공. terminal receipt guard 이전 단계 근거 |
| guarded002 | 별도 context-state의 read-only git rev-parse HEAD→terminal receipt SHA/로그hash 검증→source62 export→targetmetadata→hash이름 lookup→upload→raw→verify. COMMAND_AND_DURABLE_VERIFIED |
| 002 저장물 | [진행 source checkpoint](https://drive.google.com/file/d/1L0b_mOTivVFI5PRksmzkG3LZ667DjYPO/view), 423,728B/SHA4bee00f3b80c50d9a409fe62f2a2308e1017fbaa9b61d568efc14a591893d4c3; 당시 HEAD c3800a2, 최종 제품 PASS 아님 |
| own CURRENT | ID 유지, 이전 긴 원본 archive/hash 보존, compact 진행 상태 갱신·raw 재확인 |
| 자동화 범위 | 명시적 호출 뒤 command→durable은 실제 자동 수행. 세션 시작hook·상시 무인실행·한도 우회 없음 |

address-security-regression-01은 tool FAILED(exit1, stdout7812B) 뒤 disk RUNNING/stdout3690B로, 별도 q4-mutants-1은 tool SUCCEEDED(stdout714B) 뒤 disk RUNNING/stdout0B로 관찰됐다. 충돌 보고와 terminal 관측을 보존하고 address는 FAILED로 명시 조정했다. 원인은 미확인이다. 상태 분리나 PID 관찰 보완만으로 이 저장 충돌이 해결됐다고 하지 않는다. 현재 --require-action/--receipt-sha256 guard는 terminal receipt·로그hash가 불일치하면 export/remote write를 차단한다. 002의 guard PASS와 기반 환경 미해결 원인은 분리한다.

002는 당시 source62개와 정제 상태/action ID만 보존한다. raw로그·argv·환경파일·고객증빙·비밀키·node_modules/dist·전체 원문ZIP은 제외했다. restore/resume는 저장·커밋·배포를 자동 재실행하지 않고 source/evidence 차이를 stale/MISSING으로 드러낸다. 이후 변경과 최종 CI 증거는 다음 export에 포함한다.

## 최종 통합에서 채울 항목

- 최종 source/commit, 동일 source Node·구조·browser/시각 결과와 실행환경.
- 승인 320/375/PC 상태, 저장·취소·새로고침·재개봉의 실제 관측.
- 허용 게시범위의 동일main CI·배포ID·정확한 canonical build identity.
- 소수 실제 상호/주소 검색·선택·부모저장·복원 및 미관측 transport/과금 수.
- C55 최종 D/G와 남은 정책/환경 제한. MASTER H와 이전 실패·승인 이력 보존.

