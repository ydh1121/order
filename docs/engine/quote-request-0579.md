# MSG0579 견적 요청·고객 응답 경계

같은 `WO-ORDER-20261101-ASTRA-ENGINE-001`의 RF-03/04/05 계약이다. 기존 계산 owner는 `src/engine/calculation/quote.mjs`이며 결과 화면 owner는 `web/app.mjs`다. 이번 대조에서 실제 견적 조회 API·가격 제공자·요청 상태 owner는 발견되지 않았다. 따라서 한 요청 adapter와 최소 응답 경계를 추가한다. 실제 HTTP route, 인증 서비스, DB, 공급자 연결 또는 가격 데이터가 생겼다는 뜻이 아니다. 기존 `calculateQuote`를 재사용하며 QA에도 같은 adapter를 주입한다.

이번 변경의 엔진 버전은 `0.3.0`, 엔진 결과 계약은 `1.2.0`, 고객 DTO는 `quote-response-1`이다. 고정 Git SHA와 데이터·규칙 버전으로 재현하며 기존 결과를 새 버전 결과로 바꾸어 기록하지 않는다.

## 소유자

| 파일 | 역할 |
|---|---|
| `src/engine/adapters/quote-request.mjs` | 브라우저·QA가 공유하는 단일 요청 수명 owner |
| `src/engine/contracts/quote-response.mjs` | 명시적인 최소 고객 DTO, 응답 재검증, 문구의 의미 gate |
| `src/engine/adapters/quote-server.mjs` | 기존 서버 제공자를 주입할 경계. browser export/정적 build에 포함하지 않음 |
| `src/engine/calculation/quote.mjs` | 선택된 offer의 순수 계산·비교 적격성·가격 유효성 owner |

## 요청 계약

`createQuoteRequestService({provider,clock,requestId,onChange,longPendingAfterMs,schedule,unschedule})`를 만든다. `provider.query({requestId,inputRevision,input,signal,onPartial})`는 최소 DTO의 Promise를 반환한다. `onPartial`에도 같은 DTO를 사용하고 `completion:'PARTIAL'`을 명시한다. 실제 제공자가 없으면 즉시 `UNAVAILABLE / APPROVED_SOURCE_NOT_CONNECTED`이며 가짜 조회나 실패·성공 응답을 만들지 않는다.

- `start({input,inputRevision})` → `{requestId,inputRevision,settled}`. 입력 snapshot을 복사하고 새로운 요청 ID를 요구한다. `settled`는 정상 응답·실패 또는 로컬 무효화/분리에서 끝난다. 네트워크가 AbortSignal을 무시해도 로컬 종료는 기다리지 않는다.
- `retry()`는 같은 현재 입력을 새로운 ID로 다시 요청한다. 수정으로 폐기된 입력은 재시도하지 않고 현재 입력으로 `start`해야 한다.
- `reconcileRevision(revision)`은 기존 결과를 `STALE`로 만들며 늦은 응답을 반영하지 않는다. 수정된 입력의 revision은 호출자가 갱신해야 한다.
- `detach()`는 현재 관찰을 끊고 타이머를 해제한다. 진행 중이면 backend 취소 여부는 `UNKNOWN`이다. 이미 완료된 결과를 분리한 행위는 backend 취소를 주장하지 않는다.
- `cancel()`은 먼저 로컬 분리한다. 선택적 `provider.cancel({requestId,inputRevision})`가 **같은 requestId·inputRevision**의 `{cancelled:true}`를 확인해야만 `CANCELLED / CONFIRMED`다. 응답 없음·실패·잘못된 ID/revision은 `DETACHED / UNKNOWN`으로 남는다.
- `snapshot()`은 수명 상태·요청 ID/revision·실제 경과시간·최소 응답·의미 gate를 복사하여 읽는다. input/catalog/가격표/규칙/원문 오류를 내보내지 않는다.

`PENDING`의 장기대기 기준과 `validUntil`에는 한 개의 실제 deadline timer만 사용한다. 기본 장기대기 관측 기준은 15초이며 견적 성공·timeout 정책이 아니다. 최소대기·진행률·자동성공·반복 네트워크 polling이 없다. 빠른 결과는 즉시 끝난다. 시간이 긴 deadline은 플랫폼 타이머 범위 안에서만 예약한다. 실제 deadline에 `onChange`를 알리므로 화면을 다시 조작하지 않아도 만료된 금액의 gate를 닫을 수 있다. 테스트는 clock과 scheduler를 주입한다.

| 상태 | 의미 |
|---|---|
| IDLE | 조회 시작 전 |
| PENDING / LONG_PENDING | 실제 요청 진행 중 / 실제 경과시간이 관측 기준 이상 |
| PARTIAL | 조회가 아직 끝나지 않음. 유효 후보 0개·1개 모두 가능하며 일부 후보 거절은 전체 완료가 아님 |
| COMPLETE | 최종 정상 응답에 유효 후보가 있음 |
| EMPTY | 최종 정상 응답의 유효 후보 0개. 통신 실패·비용 미확정과 구별 |
| FAILED | 조회 실패 또는 최소 응답 형식/식별 검증 실패 |
| UNAVAILABLE | 실제 승인 source 미연결 또는 제공 불가/조건 미확정 |
| STALE | 입력 revision 변경으로 폐기 |
| DETACHED / CANCELLED | 로컬 관찰 종료 / backend 취소까지 확인 |
| EXPIRED | 선언된 유효 종료시각 도달. 종료시각과 같은 시각도 만료 |

## 서버와 최소 응답

`createQuoteServerProvider({authorizeSites,loadApprovedSource,verifyApproval,clock})`는 실제 서버 provider를 주입받는 함수다. 세 callback 중 하나라도 없으면 fail closed다. 서버 owner는 실제 인증 문맥에서 전체 요청 사업장 권한을 확인하고, 승인된 고정 source에서 가격표·상품·규칙을 읽고, 실제 승인 권한을 검증해야 한다. `APPROVED` 문자열이나 메타데이터만으로 승인했다고 처리하지 않는다. 현재 callback을 시험 대역으로 검사한 결과는 실제 운영 권한 검증 완료가 아니다.

사업장 권한은 source를 읽기 전에 확인한다. request input에서 선언된 상품·사업장·단위·수량·선택 offer·지역 및 기간/주기/납품/비용 조건 ID를 명시적으로 복사한다. 사용자 조건을 버리고 source의 기본 조건으로 바꾸지 않는다. 가격 유효 시각은 서버 clock이며, catalog/priceBook/rules와 비교 적격성 context는 source owner만 제공한다. caller의 URL·키·가격표·규칙·승인 boolean·비교 context는 사용하지 않는다. 계산 코어도 offer별 사업장/수량/단위/유효시간 조건을 다시 검사한다. provider 오류를 raw로 내보내지 않고 로그·analytics callback도 만들지 않는다.

DTO는 버전, 공용 요청 ID/revision, 완료 범위, 정해진 상태/이유코드, 최대 100개 결과, 정해진 금액 필드, 비교 적격성, 유효 종료시각만 반환한다. 결과의 `comparison.current`는 계산 owner가 같은 반올림 규칙으로 제공한 현재 총액이다. 현재 금액과 차이가 모두 올바른 금액 형식이고 total과 scale이 같으며 `ELIGIBLE`일 때만 비교를 공개한다. 현재 금액이 없는 응답은 절감을 주장할 수 없다. 기존 코어는 정확한 차이를 반올림하므로, 각각 반올림한 표시 금액을 빼서 차이를 다시 계산하지 않는다. 알려지지 않은 비용은 0원으로 보완하지 않는다. 모든 고객 grants의 주문확정·재고확보·납품보장·전체최저가 값은 false다.

`raw`, `evidence.replay`, 전체 input/catalog/priceBook/rules, offer 승인자·비공개 공급 조건·키·원문 오류는 DTO에 포함되지 않는다. decoder는 허용 필드만 다시 구성하고 금액 형식·후보 수·시각·비교 상태를 검증한다. 실패 이유가 있는 정상 빈 응답은 거절한다. 브라우저가 이미 받은 정보는 개발자도구로 숨길 수 있다는 보장을 하지 않는다.

`basis.scope='DECLARED_LINES'`, `basis.period='UNRESOLVED'`다. 현재 비교의 `periodId`는 양쪽 의미가 같다는 명시 키이며 월이라는 표시 근거가 아니다. 승인된 기간 의미 연결 전에는 월 절감 문구에 새 금액을 넣을 수 없다. `quoteProofGate`는 전체완료의 금액, 비교 가능한 양수/0/음수 차이, 정상 빈 결과, 부분0/1, 오류, 만료를 분리한다. 문구나 시각을 새로 승인하지 않으며 R3.1 화면·모션은 통합하지 않는다.

## 검증과 미연결 범위

`test/engine/quote-request.test.mjs`, `quote-response.test.mjs`, `quote-server.test.mjs`는 독립 상수 기대값·제어 가능한 Promise/clock/scheduler로 식별/늦은 응답/부분0·1/빈 결과/네트워크 실패/취소/retry/만료/DTO 누출/사업장 권한/승인 거절/선언 조건 보존을 검사한다. subscriber가 동기적으로 새 요청을 시작할 때도 이전 요청의 종료가 새 요청 Promise를 끝내지 않는 사례를 포함한다. 연구 PC 사례는 별도의 QA fixture에서 같은 product owner를 호출한다.

실제 가격 제공자, 운영 사업장 권한, 실제 API 전송·취소 확인, 재고/납품/주문, 고객 UI 최종 수락은 미연결·미검증이다. 현재 실제 데이터가 없으면 기존 산출 전/조건 확인 필요를 유지한다. 이번 Node 검사 결과를 실제 API·브라우저·상용 검증으로 합산하지 않는다.
