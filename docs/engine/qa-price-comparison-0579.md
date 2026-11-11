# MSG0579 PC-01~16 연구 adapter

같은 `WO-ORDER-20261101-ASTRA-ENGINE-001`의 QL-05/07이다. 새 계산기·상태 기계·검토 대시보드를 만들지 않는다. `test/fixtures/qa-price-comparison-0579.mjs`의 합성 입력을 `test/qa-adapters/price-comparison-0579.mjs`가 제품의 `calculateQuote`, `periodQuantity`, `createQuoteRequestService`에 전달한다. 테스트 성공은 이 제품 모듈의 합성 입력 실행 증거이며 실제 API·가격표 승인·브라우저·사용자 OS·시각 승인 증거가 아니다.

## 고정 출처와 사용 이유

| 원본 / Drive ID | bytes / SHA256 | 필요한 범위와 채택 이유 |
|---|---|---|
| 가격 비교 R1 / `1soqWPLDHO5cJcAq5i7F3vBGOAuDcNYp5` | 35,927 / `fc1a55d31fa91c54da60b01ad3ba48259e8dd6a90e3c2a9ccd3f8b7bb1a1578c` | 12조건 대조표·PC16 독립 기대값. 원본 상태는 `DRAFT_SOURCE_COMPARED_NOT_ENGINE_EXECUTED`; 정책 승인 아님 |
| 위 ZIP의 `ORDER_PRICE_COMPARISON_CASES_R1.json` | 10,989 / `ac61850ac0e9f0bc892af1104f72beb636637de79fbc9099c4ae13edd17db642` | 고정 commit `b7ca48c432cbd1284d15def276aea708a16dc99d`; expected 값의 직접 출처 |
| 승인 QA 표준 / `1MUpUCqT1bCAXdxU8rIE74w44Y5yNF6IJ` | 5,528 / `ee89b7e079d8db750cc04afe22b33cb0c99d32407dc0ccbddfa93099e92420b6` | 2026-10-30 검토 양식의 보존 조건, 제품 수락과 구별 |
| 승인 실행형 shell / `1yNvHGBIdI6alMjDSB1MgwGfpC-bNQZ8F` | 238,030 / `dd8c8542cf25baa1afa85eaed7755f07d17a40f446024efeb3dbd2334677ac44` | 좌측 그룹/안·상태·실제 viewport·독립 조작·메모 내보내기 원본 |
| 재사용 패키지 / `1hi3z2EzvRJrLFJzrWKDq4clBp97nCPGC` | 5,458,197 / `1aef1648a8857a2d989ebb18bb60903c0503a4bef7f7282a9ae5fcadb6bade5a` | manifest와 선택 지시의 필요한 범위. ZIP CRC 정상, 내부 shell hash가 위 원본과 일치 |
| 공식 화면·모션 연구 / `1q-r1krenlm2C-jYLPvzt57yXIdVqvAL_` | 37,554,184 / `d3694fa9cc62138dea80e65b51390f49c1e0086d964c00cca641819fe4b995dd` | README·접근 한계·copy 조건·motion §5–6의 요청 식별/빠른 완료/취소 의미만 인수 |

공식 연구의 `ORDER_MOTION_SPEC_R1.md`는 14,686B / `6a80b4b63799a1450ff4bc4ee3aab41cc8583861ef84eeadb2f8c61e918015cf`, `ORDER_COPY_DECISIONS_R2.md`는 21,757B / `cbc6459d9e26e76270f7ab526fa9134490f1cffaef88641672aaa04dab6e2efa`다. 공개 이미지·브랜드·회사 토큰·R3.1 고객 카피·SVG·모션을 제품에 복제하지 않는다. 제3자 화면은 내부 연구 참고이며 상용 재배포 허가를 확보했다는 근거가 없다. 한국어 스킬의 별도 LICENSE는 외부 화면 자산의 사용 허가가 아니며 이번 adapter에 그 스킬 코드나 자산을 포함하지 않았다. 새 외부 라이선스 의존성을 만들지 않았다.

현재 확보한 원본과 과거 미확보 원본을 구분한다. 위 조회로 과거 모든 raw 버전이 복구됐다고 하지 않는다. 원본·후보·선택·통합을 분리하고 이번 visual `selected=NONE`, `integrated=NONE`을 유지한다.

## 독립 기대값과 변환

고정 시각은 `2026-11-06T09:00:00.000Z`, 기본 종료 시각은 다음 날 같은 시각이다. 상품은 연구 전용 `research-egg`, 기본 단위는 개, 연구 카탈로그의 판 환산은 명시된 `30`이다. 1회 10판과 현재 비용 `50000`은 월 수요가 아니다. 세금·배송·할인 0은 합성 연구 입력에 명시된 값이며 운영 기본값이 아니다. 비교 전후 조건은 동일 상품·사업장·지역·단위·수량·기간·주기·납품조건·비용범위 ID로 선언한다. 예상값은 결과에서 생성하지 않고 아래 원본 숫자를 literal로 고정했다.

| 사례 | 실제 제품 owner와 독립 oracle | 남는 의미 |
|---|---|---|
| PC-01 | quote: 현재 `50000`, 후보 `48000`, 차이 `2000` | 전체 최저가 선택·납품 확정 아님 |
| PC-02 | quote: 배송 `3000`, 후보 `51000`, 차이 `-1000` | 단가가 낮아도 총비용 절감 아님 |
| PC-03 | quote: `POLICY_UNRESOLVED / SHIPPING_POLICY_REQUIRED`, 총액·차이 null, 상품소계 `48000` | 누락 비용을 0으로 채우지 않음 |
| PC-04 | quote: 총액 `48000`, comparison·차이 null | 현재가격 없음은 절감 0원이 아님 |
| PC-05 | request: 성공·전체완료·적격 0 → `EMPTY`, 금액 없음 | 연구 C07은 API 이름/승인 카피 아님 |
| PC-06 | request: transport 실패 → `FAILED` | 정상 빈 응답과 분리; 연구 C09 |
| PC-07 | request: 부분 적격 1 → `PARTIAL`, 차이 `2000` | 전체조회 완료가 아님; 연구 C08 |
| PC-08 | request: 부분 적격 0 → `PARTIAL`, 표시 금액 없음 | 볼 수 있는 견적이 있다는 CTA 금지 |
| PC-09 | quote: `effectiveTo == asOf` → `UNAVAILABLE / PRICE_NOT_EFFECTIVE` | 종료 시각은 제외 경계 |
| PC-10 | quote: 수량 9, 최소 10 → `UNAVAILABLE / QUANTITY_CONSTRAINT_UNSATISFIED` | 입력은 9로 유지 |
| PC-11 | quote: 승인 환산 없는 pack → `UNAVAILABLE / UNIT_CONVERSION_UNAVAILABLE` | 이름으로 임의 환산 금지 |
| PC-12 | request: revision1 응답은 revision2 현재 결과를 변경하지 않음 | 요청 식별자·입력 revision 함께 검사 |
| PC-13 | request: 로컬 취소 의도, 서버 확인 없음 → 취소확정 false | 늦은 결과 반영 중단과 backend 취소 분리 |
| PC-14 | quote: `VALID`, fulfillment `NOT_VERIFIED`, reservation `NOT_PERFORMED`, realOrderApproval false | 계산 유효성이 주문 확정 아님 |
| PC-15 | quote: null rounding → `POLICY_UNRESOLVED / ROUNDING_POLICY_REQUIRED` | 실제 반올림 정책 미결 보존 |
| PC-16 | periodQuantity: null period → `POLICY_UNRESOLVED / PERIOD_POLICY_REQUIRED`, 월금액 미생성 | 4주·30일·달력 중 선택하지 않음 |

PC-03/15/16의 실패 방지 gate가 기대대로 작동해도 비용·반올림·월 정책을 확정했다는 뜻이 아니다. 최저가 목적함수, 운영 과세/할인, 월 의미/반올림, 재고·납품 확정은 별도 정책·provider 근거가 필요하다. 기존 167 중심값·근접 주기 허용폭·ONCE 기간 통합 보류도 유지한다.

## 승인 shell 인계 계약

adapter는 DOM·CSS·별도 컨트롤을 만들지 않는다. 승인 HTML의 메타데이터/fixture 주입 지점에서 사례를 선택하고 각 프레임마다 새 `researchCase(id)`와 새 제품 request service를 생성한다. 같은 초기 fixture가 양쪽에 전달돼도 객체·provider·요청 상태·저장 상태는 공유하지 않는다. reset은 해당 초기 fixture로 새 실행을 만들며 다른 프레임의 미저장 상태에 broadcast하지 않는다.

보존할 shell 기능은 좌측 그룹/안, 짧은 차이 설명, 상태, 모바일 320/375/390 및 PC 768/960/1148/1440의 실제 CSS 폭, 가로 스크롤, 초기화, 실제 제품 조작, 메모/내보내기다. transform scale이나 browser zoom으로 PC 프레임을 축소하지 않는다. 선택 후 기준 전/수정 후/선택안/공통 입력 대조를 유지하며 사용자가 선택하지 않은 새 안을 자동 채택하지 않는다. 메모에는 case ID·원본 SHA·제품 source SHA·버전·사용자 요청·승인/보호/보류 범위를 넣는다.

현재 `scripts/build-qa-comparison.mjs`의 정적 감사 결과, 실제 제품 모듈·같은 초기 fixture·독립 메모리·기준/후보 비교는 재사용할 수 있다. 그러나 이 builder 자체는 승인 shell의 좌측 그룹/안·상태·정확한 viewport 선택·메모내보내기·선택안 역할을 제공하지 않는다. 현재 builder를 승인 표준 충족으로 보고하지 않는다. `buildQaLab({qaEntry})`, 명시 allowlist와 독립 frame envelope가 제품 adapter 연결 지점이며, 승인 shell 주입과 브라우저 검수는 UX/IA 연계 범위다. 제품 프레임 안에 검토 도구 문구·상태 스위치·가짜 가격 기본값을 넣지 않는다.

이번 변경은 test 전용이며 기존 shell/제품 UI/IA portal/private viewer를 수정하지 않는다. 실제 backend·고객 API·브라우저·사용자 OS·시각 품질·QA HTML 주입 검수는 이 Node 실행으로 승격되지 않는다.

## 검증 실행 기록

관련 명령: `node --test test/engine/price-comparison-cases-0579.test.mjs`. `ASTRA0579-PC16-NODE-001`에서 19 test가 통과했다. 고유 PC 사례는 16개이며 나머지 3개는 독립 인스턴스/초기화, 고정 만료/인위적 최소대기 없음, 연구 fixture entrypoint 경계다. assertion 수·브라우저 수로 합산하지 않는다. receipt SHA는 `3b7a3ea4b893c88ad899eb891c96df2a3dd5eddce87c3f90e46d08dcb28cbd72`, stdout SHA는 `0d724592119f6353df11bc9359ac3b85be087084d7cd75c7325dad73577a42ae`이며 재읽기에서 일치했다. source 파일별 SHA와 범위는 MSG0579 QA 증거 manifest에 기록한다. 과거 C55 수치를 재실행하거나 이번 결과에 합산하지 않는다.

19 test 중 PC-03/15/16은 정책미결 gate 보존을 검증했다. 실제 비용 정책·반올림·월 환산을 승인한 결과가 아니다. 저장 owner는 기존 승인 경로를 유지하며 이 fixture는 저장 API를 호출하지 않는다. 독립 인스턴스 검사는 JavaScript 객체·요청 상태 격리이며 실제 iframe viewport/사용자 조작 검사를 대신하지 않는다.

요청 owner의 deadline 통지·로컬 종료·부분 실패·취소 확인 revision 및 공개 현재비용 필드가 변경된 뒤 `ASTRA0579-PC16-NODE-002`로 같은 19 test를 다시 실행해 통과했다. 이전 실행을 보존하고 합산하지 않는다. 최신 receipt SHA `c7e28fc9ade7991c2c96a84c722924e9687350ed0d7e14f486c54244e7578afa`, stdout SHA `df1660234658058eeb5bcd92586826736288d9ced4e39c433eebc504ccd60826`를 재읽기 확인했다.

`test/browser/quote-result-0579.smoke.mjs`와 test 전용 composition entry는 실제 build의 `createOrderApp({quoteProvider})`, Q4, native browser storage, 결과 DOM을 대상으로 하는 9개 CI 검사를 제공한다. 유효 입력 gate, provider 없음, 부분0/1, 성공·실패·빈값·만료, 편집 후 늦은 응답, 새 요청 ID, DOM 노드 보존, 배송비 포함 비용 증가 및 조회 과정의 저장 부작용을 검사한다. 재시도/취소는 반환 controller 계약 호출이며 새 UI 버튼이 있다고 주장하지 않는다. 이 문서 작성 시 authoring·syntax 검사만 수행했고 브라우저 실행은 root의 같은 커밋 CI 담당이다. loopback의 합성 provider/DNS와 실제 API·주소 제공자·승인 shell·사용자 시각 수락을 분리한다. 요청의 실제 규격·수량·단가 전달은 확인하지만 운영 상품/공급가격 mapping 승인은 별도 미검증이다.

브라우저 통합 fixture의 시각은 build에 포함된 IANA manifest `collectedAt + 1000ms`로 고정하고, 유효한 연구 offer의 `asOf`와 종료시각(그 시각 + 1일)을 명시적으로 맞춘다. 같은 고정 시각·IANA 원본 hash를 CI 보고서에 남긴다. 정적 리뷰에서 발견한 Nov6 browser clock 대 Nov10 IANA의 미래 metadata 충돌을 test fixture에서 해소한 것이며 이메일 freshness/완료 gate를 우회하거나 완화하지 않는다. PC16 원본 엔진 fixture의 Nov6 시각과 만료 사례는 그대로 보존한다.
