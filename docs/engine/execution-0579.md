# MSG0579 누적 후속 실행과 인수 경계

PROJECT=order.ooo / SELF_TRACK=ASTRA_ENGINE_EXECUTION / EXISTING_WO=WO-ORDER-20261101-ASTRA-ENGINE-001 / CONTINUE_MESSAGE=MSG-20261111-0579.

기준은 [MSG0579](https://drive.google.com/file/d/1mgYMu8wMT9Hu_HvOXrL7OKM02pDOZ6kf/view)와 [R9 17항목 원장](https://drive.google.com/file/d/1k5NFW1aaZ6kXeGSSTEYtWhMhhxnSULXx/view)이다. 이 문서는 변경 후보의 소유자·항목 처분·남은 결정을 기록한다. 최종 commit, 같은 commit의 필수 CI, 정규본 배포/root identity, 실제 브라우저 관측과 Drive 납품은 별도 최종 보고서의 증거로 확정한다. 개발 중간 검사의 숫자를 최종 결과로 고정하지 않는다.

이전 MSG0549/C55·구조·5스킬·126원문 바인딩·28과업 라우터는 기존 완료 범위로 보존했다. 새 계산기·상태 시연 앱·인증 시스템·DB·IA 포털을 만들지 않는다. 새 요청 계약은 확인되지 않은 실제 API가 이미 있었다는 주장과 구별하며, 기존 계산·앱·저장 소유자에 연결할 단일 adapter다.

## 묶음 A — 정규본 수정사항 피드백

| ID | 처분 | 실제 변경·기존 근거 | 남은 조건과 책임 |
|---|---|---|---|
| RF-01 | 완료 — 설계 계약 | [domain-boundaries-0579](domain-boundaries-0579.md): 계란은 원재료 설정의 첫 분야. catalog/product/site/unit 기반 기존 계산 owner를 유지 | 현재 메인 교체·다른 원재료 서비스·공급자 앱 출시는 승인 범위 밖 |
| RF-02 | 완료 — 비교 gate / 정책미결 | 기존 `calculation/quote.mjs`에서 명시 비교 기준·상품/단위/수량·기간/주기/납품/비용 조건·유효시각·현재가격 출처를 대조. 비용누락/만료/불일치와 nullable 차이를 구분. [계산 계약](calculation.md), PC16 연구 adapter | 실제 승인 가격 source, 최저가 목적함수, 과세/할인, 월 의미·반올림 미결을 임의 확정하지 않음. 선택 offer 계산이며 전 공급처 최저가 선정이 아님 |
| RF-03 | 완료 — 요청 계약 | [quote-request-0579](quote-request-0579.md)의 요청 ID/input revision, 늦은 응답, partial0/1, empty/error, retry/new ID, 만료·실제 대기시간·로컬 detach/backend 취소 확인 분리 | 실제 backend 전송·서버 취소·운영 provider 의미는 미연결. Node 주입 시험은 실제 API/브라우저 PASS가 아님 |
| RF-04 | 완료 — 서버/DTO 경계 | 같은 계산 owner를 부르는 server adapter가 사업장 권한→고정 source→승인 검증 순서를 요구. 최소 DTO/decoder는 전체 input/catalog/priceBook/rules/replay·원문 오류·키를 반환하지 않음 | 운영 인증 문맥·사업장 ACL·가격표 승인자 연결은 서버 owner 증거 필요. 브라우저에 전달한 내용을 개발자도구에서 숨긴다는 보장 없음 |
| RF-05 | 완료 — 의미 gate / UX·IA의존 | `quoteProofGate`가 금액·양수/0/음수 차이·빈 결과·부분0/1·오류·만료를 분리. 실제 결과 소비자는 동일 gate를 사용해야 함 | 승인 source가 없으면 산출 전/조건 확인 필요 유지. 기간 의미 미결이면 월 문구에 금액을 넣지 않음. 실제 앱 연결/검수 증거는 최종 보고서에서 구분. R3.1 카피/시각/모션 통합 승인 없음 |
| RF-06 | 향후과제 — 최소 설계 기록 완료 | [domain-boundaries-0579](domain-boundaries-0579.md)의 snapshot/request/revision/time, source versions, 권한·비교 기준, exact result, coverage/expiry, fulfillment, lineage 최소 필드 | 신규 데이터 수집·거래/시장 분석·DB는 구현/출시하지 않음. 향후 별도 소유자·권한·보존 범위 필요 |

## 묶음 B — QA랩 반영

| ID | 처분 | 실제 인수·근거 | 남은 조건과 책임 |
|---|---|---|---|
| QL-01 | 기존완료유지 | 기존 공식 공개 자료의 고정 파일/해시를 필요한 계약 근거로 재사용. 새 외부 전량 수집 없음 | 제3자 화면/브랜드 자산을 제품에 복제하지 않음. 상용 재배포 허가를 추정하지 않음 |
| QL-02 | 기존완료유지 / UX·IA의존 | 기존 픽셀/프레임 연구는 출처로 보존. 승인 shell와 현재 builder의 차이를 실제 소스 감사 | 새 화면 배치·실 CSS 폭·native 렌더는 UX 재작업. source/Node 검사로 시각 수락 대체 금지 |
| QL-03 | UX·IA의존 | 첫 화면/대기/결과에 필요한 실제 요청·결과 의미만 제공 | 사용자 반려 R3.1 화면을 통합하지 않음. UX가 새 후보와 정상 부팅·시각 검수를 반환 |
| QL-04 | UX·IA의존 | 빠른 실제 완료, 장기대기, 요청 식별·취소·만료 이벤트 계약 제공 | SVG/WebM·프레임·모션 품질은 UX 소유. 가짜 진행률·최소대기·자동 성공 없음 |
| QL-05 | 완료 — module 연구 adapter / UX·IA의존 | PC 정상빈결과/통신실패/부분0·1/취소/만료를 실제 product request/calculation owner로 실행하도록 연결 | 승인 QA shell 주입·브라우저 비교는 미완료 의존. 합성 transport 결과를 실제 API PASS로 합산하지 않음 |
| QL-06 | 기존완료유지 | 필요한 한국어 원문·copy 조건 및 라이선스 경계를 [QA 출처 기록](qa-price-comparison-0579.md)에 연결. 모든 스킬 일괄 재로딩 없음 | 새 고객 카피 승인은 하지 않음. 외부 스킬 LICENSE와 제3자 화면 사용 권한을 혼동하지 않음 |
| QL-07 | 완료 — PC16 연구 adapter / 정책미결 | `test/fixtures/qa-price-comparison-0579.mjs`→`test/qa-adapters/price-comparison-0579.mjs`가 기존 quote/period/request owner를 호출. 고정 시간·단위·명시 비용·독립 literal oracle | PC03 배송, PC15 반올림, PC16 기간 미결을 원인 코드로 유지. 최종 같은 소스 검사 결과는 별도 고정. 고객 bundle에 fixture 없음 |
| QL-08 | 완료 — 증거 연결 | 사례별 원본 기대값, 변환, source hash, 실제 command/receipt/log, 실패와 수정 사유를 보존 | 원본/후보/선택/통합을 분리. 과거 누락 raw 원본을 재제작해 복구라고 하지 않음 |
| QL-09 | UX·IA의존 | 회사 스타일 연구·기존 원본 이력 보존. selected=NONE / integrated=NONE | 사용자가 선정한 새 차이와 실제 source/hash가 오기 전 회사 토큰·R3.1 화면 통합 없음 |
| QL-10 | UX·IA의존 | 입력/revision·미저장 상태·오류·결과 보존에 필요한 엔진 독립 계약만 인수 | 회사 버튼 최초 부팅·전환·private viewer/native 검수는 UX/IA 소유. Astra가 IA 메뉴/ACL/allowlist를 변경하지 않음 |
| QL-11 | 완료 — 경량 인수/반환 overlay | [harness-0579](harness-0579.md), AGENTS의 단일 TARGET·Drive durability·실제 restore/resume·raw 증거 보존 규칙. 원본/프롬프트/검사/선택 계보 유지 | 공통 Harness/다른 방 CURRENT 수정 없음. 기존 historical receipt 차이/미보관 raw로그를 숨기거나 새 성공으로 바꾸지 않음 |

승인 QA 형식은 좌측 그룹/안·상태·실제 CSS 폭·초기화·실제 조작·선택 메모/export다. 양 프레임은 같은 초기 사례에서 독립 조작한다. 현재 repo의 단순 before/after builder는 이 형식 전체를 충족하지 않는다. 이번 adapter 준비를 새 QA 앱이나 승인 shell 전체 연결 완료로 표시하지 않는다. 정확한 소유자·주입점·미검수 범위는 [qa-price-comparison-0579](qa-price-comparison-0579.md)에 있다.

## 미결 결정의 선택안과 영향

미결 때문에 독립 구현을 중단하지 않는다. 아래 선택은 아직 채택되지 않았으며 승인된 기존 산식·정책을 바꾸지 않는다.

| 결정 | 구체적인 선택안 | 결과에 미치는 영향 / 결정 전 동작 |
|---|---|---|
| 비교 대상과 최저가 목적 | A: 현재처럼 명시적으로 선택한 offer의 적격성/총비용만 계산. B: 승인된 공급처 집합의 완전한 총비용으로 순위 선정 | B는 조회 범위·누락 공급처·동률·납품 충족·비용 완전성 계약이 추가로 필요. 지금은 A이며 globalMinimum=false; 단가 최저를 총비용 최저로 바꾸지 않음 |
| 과세/배송/할인 source | A: 승인 source가 해당 거래 범위의 명시 component amount+ruleId 제공. B: 승인된 과세/배송/할인 산출 규칙을 별도 server owner에 연결 | A도 운영 금액/규칙을 새로 발명하는 선택이 아님. B는 과세 포함/별도·배송횟수·할인 자격/중복 규칙이 확정돼야 함. 누락 항목은 POLICY_UNRESOLVED, total/difference null |
| 현재 구매비용의 비교 근거 | A: 출처·관측시각·통화·상품/단위/수량·기간/주기/납품/비용 기준이 확인된 값. B: 사용자 입력값을 잠정 참고로만 보관 | B를 확인된 절감 근거로 승격하지 않음. 값 없음은 CURRENT_PRICE_MISSING, 조건 불일치는 INELIGIBLE, 근거 미확정은 POLICY_UNRESOLVED |
| 월 의미 | A: 명시한 실제 달력 기간과 승인된 일정/방문 수. B: 계약상 청구 기간 또는 명시 4주 기간을 별도 이름으로 사용 | 기간 간 동일성은 자동 성립하지 않음. periodId 일치만으로 '월' 의미가 확정되지 않음. 결정 전 per-delivery 합계를 월금액/월절감으로 변환하지 않음 |
| 반올림 | A: 현재 owner의 TOTAL 단계와 승인 source의 mode/scale를 사용. B: 현행과 다른 단계/정밀도를 제안해 별도 정책 승인 | B는 기존 승인 계약 변경이며 이번에 채택하지 않음. 규칙이 없으면 ROUNDING_POLICY_REQUIRED. 테스트의 명시 연구 규칙을 운영 기본값으로 쓰지 않음 |
| 납품/재고 확인 | A: 계산 견적으로만 제시하고 미확인 표시. B: 실제 권한 있는 provider의 확인/예약 근거를 연결 | B는 재고 수명·확인 시각·취소/예약 계약 필요. 현재 orderConfirmed/stockReserved/deliveryGuaranteed=false |
| 실제 조회 연결 | A: 미연결 source를 명시하고 현재 결과 제한 유지. B: 기존 승인 server owner의 권한/source/승인 callback과 실제 endpoint 계약 연결 | B 완료에는 실제 사업장 ACL·승인 가격표·실전송/오류/취소 증거 필요. injection 시험은 B의 운영 완료 증거가 아님 |

167 중심값·새 근접주기 허용폭·ONCE 기간 통합·상용화 후 P30·유료 도구/Dot·새 원재료 플랫폼/광고/시장데이터 기능은 이번 미결 해결 명목으로 추가하지 않는다.

## 환경·기록·납품 경계

2026-11-11 기존 Cloudflare `order-ooo`의 provider GET→최소 PATCH→GET에서 preview `all`→`none`만 바뀌었고 production main 자동배포와 연결 repo는 보존됐다. 이는 현재 설정의 실제 관측이다. 그때 canonical deployment `89837fe5-8a59-4d16-bf2e-e1f7fa497c56` / source `3d26166b350c7f70ed303448df21a5452051c162`는 기존 IANA main이다. 이를 이번 새 제품 후보의 배포 완료로 표시하지 않는다.

본인 MSG0579 Bus row584는 실제 실독 후 ACKED이며 다른 수신자 ACK는 쓰지 않았다. 기존 CURRENT는 [PRE_MSG0579 역사](https://drive.google.com/file/d/1kj1IIccdOUsl1x3bH4IonGfBrZZbBmFT/view)에 7,481B/SHA-256 `5753302df04a2a3ce92a6b8527654bc962a519a49f314e63cbaf0f5db8c2ed9e`로 보존·raw 검증됐다. 새 CURRENT 최종 갱신은 source/CI/실제 검수와 납품 파일이 고정된 뒤 수행한다.

최종 manifest는 실제 반환 파일/bytes/hash, 고유 버전/부모 버전, 제작·업로드·검증자와 실제 시각, 지정 폴더/ID/access/raw readback, source/CI/native/selection/integration의 독립 상태를 담는다. 새로운 실제 receipt와 stdout/stderr 원본은 증거 ZIP의 명시 allowlist에 넣고 재다운로드 후 그 해시까지 검증한다. 정제 host archive만으로 raw 복구 가능하다고 하지 않는다. 과거 missing raw로그는 과거 한계로 유지한다. 미보관 파일이 남으면 PARTIAL_DELIVERY 또는 DELIVERY_BLOCKED_DRIVE이며 인계 완료가 아니다.

## 수신자별 계약 참고 블록

아래는 기존 지시의 의존 계약이다. 발행/사용자 전달/수신/실행을 구분한다. 최종 보고서의 고정 source·manifest를 붙인 뒤 사용하며 이 문서 작성 자체는 다른 방의 수신/실행이나 새 공개 권한이 아니다.

### UX 실행방

```text
PROJECT=order.ooo
TARGET_TRACK=UIUX_SUCCESSOR
EXISTING_WO=WO-ORDER-20261013-UIUX-V02-LOWFI-002
CONTINUE_MESSAGE=MSG-20261106-0569
SOURCE=기존 UX 재작업 지시 https://drive.google.com/file/d/1GA6ipzjKmgg-BYz8YVR-8k9H4My-MPn5/view + Astra MSG0579 최종 고정 source/manifest
DELTA=실제 quote request/DTO/proof gate와 PC16 adapter를 기존 승인 QA shell의 주입 계약으로 사용한다. C01~C11은 연구 ID이며 실제 API 이름이 아니다.
SCOPE=기존 승인 좌측 그룹/안·상태·실 CSS 폭·독립 두 프레임·초기화·실제 조작·메모export 안에서 첫/대기/결과의 새 후보를 검수한다.
BOUNDARY=R3.1 원본/실패 보존. selected=NONE/integrated=NONE. 새 가격정책·가짜 가격·최소대기·확정되지 않은 서버취소·주문/재고/납품 보장 금지. IA 구현/ACL을 대신 수정하지 않는다.
RETURN=새 고정 파일/hash, 정상 열기 절차, 최초부팅/실제 조작·viewport·상태 보존·시각/모션 증거, 실패/미검수 범위와 선택 상태.
UNMET=승인 shell adapter 실제 주입·native 비교 및 사용자의 새 선택. 이 조건 전에는 시각 반려/선택/통합을 종료하지 않는다.
```

### IA 기획방

```text
PROJECT=order.ooo
TARGET_TRACK=IA_PORTAL_PLANNING_SUCCESSOR
EXISTING_WO=WO-ORDER-IA-PORTAL-R0-R1-20261015-001
CONTINUE_MESSAGE=MSG-20261107-0572
SOURCE=기존 역할별 지시 https://drive.google.com/file/d/1MnKJxSFArFCebOenYf8YL0Bt24mU7a6M/view + Astra MSG0579 최종 고정 source/manifest
DELTA=엔진/요청 계약·연구 adapter와 실제 UI/선택/통합/운영 provider 상태를 구분한 의존 기록이다. 새로운 viewer 등록·권한 요청이 아니다.
SCOPE=기존 원장과 사용자 반려·계보·역할별 계약에서 관련 차이만 검토한다. 새 UX 고정 반환이 없으면 최신/선택/통합을 추정하지 않는다.
BOUNDARY=기존76ScreenID·사용자메모·원본/승인이력 보존. R3.1 실행 인수·등록·ACL/allowlist 확대 HOLD. IA 실행 ACK나 실제 구현 완료 대리 기록 금지.
RETURN=기존 메시지/원장에 해당하는 계약 차이와 정확한 남은 조건. 신규 등록/권한이 필요하면 구체적인 파일/hash·목적·승인 의존점을 분리한다.
UNMET=사용자가 선택한 UX 차이와 승인된 IA 인수 범위. Astra Node/CI 성공만으로 이 조건이 충족되지 않는다.
```

### IA 실행방

```text
PROJECT=order.ooo
TARGET_TRACK=IA_PORTAL_IMPLEMENTATION
EXISTING_WO=WO-ORDER-IA-PORTAL-R0-R1-20261015-001
CONTINUE_MESSAGE=MSG-20261106-0566
SOURCE=기존 실행 지시 https://drive.google.com/file/d/17nbhCk_Ax2h7KiGYFwl0H2Wa0EwLE5BL/view + Astra MSG0579 최종 고정 source/manifest
DELTA=동일 입력/revision·미저장 상태·오류·결과 보존 및 늦은응답/분리 계약을 기존 viewer 경계의 참고 계약으로 사용한다. 새 화면/가격표/API/게시가 생긴 것은 아니다.
SCOPE=현재 진행 중인 같은 PR1/branch의 승인된 연결·fullCI를 계속한다. 이미 복구한 후보·기존계정·기존4파일 계약을 재선정하지 않는다.
BOUNDARY=PUBLICATION_HOLD 유지. R3.1 allowlist/ACL/CSP 확대나 새 preview/main/Access 변경은 이 계약으로 승인되지 않는다. Astra는 IA 코드를 수정하지 않았다.
RETURN=실제 same-head 소스/필수CI와 provider/document 전달·최초부팅·전환·상태보존·격리·실제 URL 증거를 각각 구분한다.
UNMET=선정된 UX source/hash와 기존 승인 범위에서의 실제 제공·부팅/전환 검수. source/Node 성공을 native/OWNER 성공으로 승격하지 않는다.
```

세 블록은 서로 다른 수신자를 합치지 않는다. 참고만 필요한 시점에는 전달하거나 ACK를 요구하지 않는다. 실제 실행 요청 시에는 최종 고정 증거를 붙이고 수신방 수와 독립 블록 수가 일치해야 한다.
