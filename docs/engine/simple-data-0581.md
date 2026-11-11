# MSG0581 배송 묶음·비교 문서 데이터 후보

WO-ORDER-20261101-ASTRA-ENGINE-001 / `ORDER-PARTIAL-20261112-063305-R1` / `MASTER-PARTIAL-FEEDBACK-20261112-R1`.

이 변경은 잠정 코드·검사 후보다. main 병합·정규본 게시·공급처 관리자·실제 가격/접수·문서 디자인 수락을 포함하지 않는다. 이번 원문의 `reviewed=true`는 최종 정책 승인이 아니다. SIMPLE-04의 원문 `decision=recommendation`과 자유서술은 둘 다 보존한다. 선행 후보는 자유서술의 공급처 설정→문서 단위 경계를 적용하며, 소비자 Q1/Q3/Q4에 배송 묶음 질문을 추가하지 않는다.

## 소유자·호출점

| 항목 | 실제 소유자/호출 | 구현 범위 | 남은 연결 |
|---|---|---|---|
| SIMPLE-04 | `src/engine/contracts/shipping-bundle.mjs`의 `readSupplierShippingBundle` / `projectShippingBundleQuantity` | 공급처·상품·revision·출처와 양의 단위비율을 allowlist로 읽고 기존 `exact.mjs`와 catalog.units로 문서 단위 투영 | 실제 공급처 관리자/권한·승인 source는 미연결. VALID는 자료 구조 적합성일 뿐 운영 권한 확인이 아님 |
| UX-02/04 | `web/quote-document.mjs`의 `buildQuoteDocumentModel` | 기존 `projectQuoteInput`와 `readCustomerQuoteResponse`/`quoteProofGate`를 재사용하는 읽기 전용 네 그룹 표시 모델 | UX가 고정 후보 디자인과 실제 QA shell 연결을 검수. 새 견적서/영수증 디자인은 선택하지 않음 |

배송 묶음은 상품 포장과 별개다. 예를 들어 연구 fixture의 상품 단위 판과 배송 단위 상자를 연결하더라도 구매수요·상품단가·MOQ는 바뀌지 않는다. 환산은 기존 exact 연산으로 수행하며 나누어떨어지지 않는 결과를 올림하지 않는다. 반환하는 rational JSON은 내부 데이터 계약이다. 고객 input/텍스트에 분수 문자열을 그대로 넣는 형식은 제공하지 않는다. 문서 단위의 최종 표시/반올림과 견적서·납품 후 영수증 각각의 노출 시점은 `UNRESOLVED`다. 이 계약은 새 가격 정책이나 배송비 계산기가 아니다.

```js
// A trusted supplier owner can call this after its own authorization/source checks.
// No supplier/admin/network is created by this module.
const parsed = readSupplierShippingBundle(configuration);
const unitProjection = projectShippingBundleQuantity({
  configuration, product, supplierId, quantity, unit
});

// The actual quote lifecycle owns inputRevision and observation time.
const model = buildQuoteDocumentModel({
  state: committedProductState,
  snapshot: quoteService.snapshot(),
  inputRevision: currentInputRevision,
  observedAt: clock()
});
```

## 기존 네 그룹 대응표

기존 위치는 `web/app.mjs`의 `invoiceDetails()`다. 이 표는 데이터 소유자를 설명하며 기존 UI 재배치/디자인 선택을 뜻하지 않는다.

| 기존 그룹 | 모델 ID | 자료 원천 | 의미와 미확인값 |
|---|---|---|---|
| 구매 내역 | `purchase` | `projectQuoteInput(state).purchases/currentPurchaseTotal`; 내부 계산은 기존 `currentPurchaseCost/totalPurchaseCost` | Q1 housing/size/pack와 Q2 qty/qtyUnit/qtyExact/price. 고객 월 입력이며 공급 견적/확인된 비교 비용과 구분. 합계의 사업장 범위는 이 계약에서 추정하지 않아 `totalScope=null` |
| 납품지별 배정 | `assignment` | 기존 연결된 sites/allocations | stable ID·region·주소 검증 상태, 월 원수요/정수계획/manual·derived와 회당 qty를 각각 보존. 주소 상세·연락처·증빙·팝업 초안은 제외. 미확인 지역을 검증 완료로 승격하지 않음 |
| 납품 조건 | `terms` | 기존 allocation의 mode/cadence/repeat/date/휴무 조건 allowlist | 주차·요일/주기·ONCE 원문 의미를 보존. 수량이나 주기 기본값을 만들거나 미래 시작일/반복 횟수를 계산하지 않음 |
| 비용 비교 | `comparison` | 고객용 `quote-response-1` + 기존 `quoteProofGate` | currency/currentCost/quoteCost/difference/eligibility/coverage/validUntil. 단일 완료 견적만 금액을 제공. 비교 근거가 없으면 current/difference는 null; 로컬 구매비용을 확인된 서버 비교값으로 대체하지 않음 |

`requestedAt`은 실제 요청 서비스의 `startedAt`이며 공급 가격의 기준시각이 아니다. `observedAt`은 호출자가 제공한 관측 시각이다. 현재 최소 DTO에 공급자 계산 기준시각이 없으므로 `providerCalculatedAt=null`을 보존한다. 공개 응답에 없는 catalog/priceBook/replay/private terms를 새로 노출하지 않는다. 정확한 상품/지역/수량 표시는 현재 같은 revision의 사용자 선언에 근거하며 공급자가 확인했다고 표시하지 않는다. 실제 서버 자료와 UI ID의 매핑은 기존 승인 provider 연결의 미결 지점이다.

현재 inputRevision과 snapshot/response의 requestId·revision이 일치해야 한다. 명시적 관측시각이 없거나 만료·STALE·PARTIAL·FAILED·DETACHED 상태이면 완료 비용/절감액을 반환하지 않는다. 여러 견적 중 임의 첫 값을 선택하지 않는다. 수령한 `proof`를 그대로 믿지 않고 허용 DTO를 재구성한 후 기존 proof gate를 적용한다. 금액을 재계산·반올림·월환산하지 않는다. 읽기에는 저장·네트워크·외부 상담 접수 부작용이 없다.

간편 state의 `simpleQuote`가 있으면 같은 모드 owner의 `projectSimpleInput`/`inspectSimpleQuote`를 호출한다. purchase의 `totalScope=UNCONFIRMED`와 규격 모름, assignment의 `regionIntent`(사업장 수·공통/개별 지역 원문·stable ID), terms의 `orderIntent`(FLEX 주/월 원문·FIXED 협의 유형·ONCE·선택 희망일)를 네 그룹 안에 보조 자료로 제공한다. 자세한 사업장 주소/배정은 빈 배열로 두고, 공통 지역을 사업장 수만큼 복제하거나 수량을 배분하지 않는다. 원문에 없는 지역 코드는 null이다. 비활성 주/월 선택도 원문으로만 남기며 반복 횟수로 해석하지 않는다.

간편 입력은 최신 검사 owner가 항상 `proofBlocked=true`와 `MONTHLY_SCOPE_UNCONFIRMED`를 반환한다. 따라서 이전 상세 견적의 유효 응답이 전달되더라도 간편 문서의 확인된 금액·비교·절감 표시는 차단한다. 잘못된 간편 envelope가 상세 모드로 fallback하지 않는다. 상담 관심은 선택값만 보존하고, 인증·사업자 검증은 `UNKNOWN`이며 접수/예약/동의를 부여하지 않는다.

## 검사와 한계

`node --test test/engine/simple-data-0581.test.mjs`는 합성 source만 사용한다. 기존 실제 `calculateQuote`, 공개 DTO, 요청 lifecycle, 상품 단위 exact 연산을 호출하여 독립 literal 기대값과 대조한다. 공급처/상품 불일치, 단위 부재, 출처 누락, 비정수 배송 묶음, 네 그룹·다른 구/동, 월/회당 분리, 원자료 불변, 현재 비용/배송비 부재, request/revision 불일치, partial/empty/failure/취소/만료, 중복 견적, 비공개 필드 제거를 검사한다.

이 결과는 실제 공급 API·공급처 관리자·사업장 권한·디자인·운영 문서 노출 정책의 PASS가 아니다. 동일 커밋 CI/실제 소비자 연결 및 최종 Drive 원본 해시 증거는 MSG0581 최종 보고서에서 고정한다.
