# MSG0517 — 최신 정본 사용자 피드백 재작업

WO-ORDER-20261101-ASTRA-ENGINE-001 / ASTRA_ENGINE_EXECUTION. [전체 지시](https://drive.google.com/file/d/1IzJi1ydXCaeP2NGZIuCIfaHf_FFEF2CF/view)를 실제 읽고 저장소 AGENTS.md·README 및 최신 remote main과 대조했다. 이 문서는 소스 기준과 F01–F09 추적표이며 아래 미확인 항목은 완료나 수락을 뜻하지 않는다.

## 기준 소스와 이전 검사 이력

| 항목 | 직접 읽은 결과 |
| --- | --- |
| repository / 작업 branch | [ydh1121/order](https://github.com/ydh1121/order) / `feat/order-astra-engine-20261101` |
| 실행 전 remote main | `634a3f19432e30e8fb4996a2b6b48591f1803167` |
| 직전 부모 | `643c28897f3ac46fbd16454a74c953f769f1fbd2` |
| 두 커밋의 Git tree | 둘 다 `288a7135141e9085919c809b009c799d1c7ff048`; 634a는 제품 파일 변경 없는 배포 트리거 |
| 기존 UX 인수 출처 | 495479 bytes / SHA-256 `c02467f859829b438b3142435fe4698f335c42bae592d9f32255774ffe210e16` |
| baseline Cloudflare check | `124760850618`, Cloudflare Pages, head 634a, completed/success |
| baseline deployment ID | `aebf0e2f-da6a-4452-a1fd-27fb57d2fd6c`; check의 external_id와 order-ooo details URL에서 직접 확인 |
| baseline CI | [41276905922](https://github.com/ydh1121/order/actions/runs/41276905922), 동일 634a의 attempt 1 failure / attempt 2 success |
| 최초 실패 job | [124760810730](https://github.com/ydh1121/order/actions/runs/41276905922/job/124760810730), 2026-11-01 14:25:43~14:27:09 KST |
| 같은 소스 재실행 job | [124761251037](https://github.com/ydh1121/order/actions/runs/41276905922/job/124761251037), 2026-11-01 14:28:07~14:29:58 KST |
| provider 전체 설정 | 이 읽기에서는 미검증: production branch/자동 배포, preview None, build/output/root/Node 설정은 check 성공만으로 판정하지 않음 |

읽기 근거는 지정 증거 폴더의 `0517-source-history.json`에 보관한다. GitHub `/commits/634a…/check-runs`는 실제 성공했다. 개별 최상위 `/check-runs/124760850618` 경로는 connector 허용 URL 검사에서 HTTP 400으로 거절되어 commit 범위 경로로 읽었다. 이 거절은 Cloudflare 인증 실패나 배포 부재를 뜻하지 않는다. 자동 생성 배포 주소가 check 출력에서 “Preview URL”로 표기된 사실도 preview branch 설정이 ON이라는 증거로 확대하지 않는다.

## F01–F09 변경 추적표

F01–F09 구현을 기존 소스에 반영했다. 로컬 `npm test` 290/290 및 `npm run build` 26파일/650125바이트가 통과했다. 실제 Chromium·같은 상태 캡처는 PR CI에서 실행하며 현재 PASS로 선기록하지 않는다. 최종 검사는 같은 고정 커밋의 결과와 아래 반환 기록으로 확정한다. 기존 소스 성공을 이번 수정 성공으로 재사용하지 않는다.

| 항목 | 확인한 원인 | 수정 계약 / 공통 소유자 | 검사와 미해결 |
| --- | --- | --- | --- |
| F01 계란 추가 오류 | `legacyErrorState`가 picks에 오류 의미를 부여하고 CSS `#sku-editor .picks[aria-invalid=true]`가 그룹 전체 outline을 그림 | `web/app.mjs`의 명시 검증/편집 중립, `web/styles.css` 공통 필드 제목·개별 선택 오류; aria-invalid·오류 연결·focus-visible 유지 | 난각/크기/포장 각각 누락·부분 선택·해소·수정/취소 및 같은 상태 전후 실제 캡처: 최종 실행 근거 연결 필요 |
| F02 Q2 정렬 | `.input-unit` baseline 배치와 44px select, 가격 suffix의 높이 차이 | `web/styles.css` 공통 입력 행에서 높이·baseline·밑줄·label 간격 소유; 단위 클릭 영역 유지 | 320/375/390/768/1440, 빈/포커스/오류/완료 및 짧고 긴 숫자 rect·computed style·캡처 필요 |
| F03 수요·포장·금액 | `convertMonthlyUnit`의 exact rational 저장값을 표시 input과 요약에 노출; `showComma`가 비숫자를 제거; `exactDisplay`가 금액 분수도 표시 | `web/quantity-contract.mjs`에서 정확한 기본 수요와 필요 포장수/수동 입력 구분, 금액 HALF_UP scale0 표시만 반올림; 앱 입력 소유자와 엄격한 저장 계약 연결 | 6000/6001/6050/6060/6061, 10/20/30구, 수동202판=6060개·2020000원, 원수요6050개=2016667원, 왕복/blur/취소/복원/Q4/합계 최종 근거 필요 |
| F04 이메일 | xyz/art/in은 참조 목록에 있으며 세 naver 예시는 실제 NXDOMAIN 관측; 허용 목록 누락으로 단정할 근거 없음 | 기존 `src/engine/validation/email*.mjs`와 browser DNS/IDNA/IANA adapter 계약; 실제 도메인 경로 확대 검사와 실패 분류 보존 | 실 DNS query/RCODE/MX/A/AAAA/시각·참조 hash 별도 기록; mock·실 HTTPS·mailbox 소유 검증 구분 |
| F05 연락처 비교 | `OrderCopyDialog.renderReview`의 현재값/변경값과 기존 values 배치 | `web/common-ui.mjs` 공통 renderer, `web/styles.css` 3열/2행·현재 중립/변경 후 기존 파랑 | 1/9/10/20 대상, 빈/긴 값, 320/375, 쓰기0→1/취소/stale/focus 검증 필요 |
| F06 Q4 주소 없는 초안 | checkbox disabled, assignment-next basicIssues, 최종 commit Q3 gate의 세 차단 | stable ID의 초안 편집/저장 gate를 분리; 전체 `OrderSiteContract`와 완료/결과 gate의 주소·필수 연락처 검증 유지 | 주소 없는 선택/다음/편집/저장, 완료 차단, 취소/중복/stale/Q3변경/삭제 경계 검증 필요. live 주소검색 HOLD |
| F07 체크 행 | 기본 `.q4-check-row`와 dialog별 flex-start/center·높이·line-height override 중첩 | `web/styles.css`의 공통 단일 행/첫 제목 행 variant; 실제 사용처 목록과 CSS 정리 | checked/unchecked/disabled/focus/error 및 다중행 rect/font/capture 필요; Linux 관측을 Windows/iPhone/Android 수락으로 확대하지 않음 |
| F08 내부 문구 | 제품 title의 MSG0497 작업명 및 Q3 소재지 구현 안내문구 잔존 | `web/index.html` 제품 이름과 접근성·필수 오류, app의 해당 연결부만 정리 | 제품 root/title/접근성 상태 확인 필요; 개발 출처는 build-identity/보고서에 유지 |
| F09 profile 재시작 | 첫 attempt의 launch2에서 dnsReady 15000ms timeout, 합성 DNS 호출0; 원인 미확정 | `test/browser/storage.smoke.mjs` 실패 순간의 비식별 저장/IANA/email lifecycle 근거; 기존 timeout/성공 조건 유지 | 과거 실패/재실행 성공을 모두 유지. 새 관련 초기화 코드 재시작 검사 필요; 원인 확정·해결로 보고하지 않음 |

## F09 보존해야 할 실제 관측

첫 attempt의 저장 smoke는 3개 case에 진입했다. `S01_COMMITTED_Q1_Q4_ID_UNIT_SOURCE_AND_PRODUCT_RELOAD`와 `S04_NEW_TAB_SAME_ORIGIN_ASSET_REFRESH_AND_DNS_RECHECK`는 PASS, `S04_FULL_BROWSER_PROFILE_CLOSE_AND_RELAUNCH`는 FAIL이었다. 이후 12개 case는 해당 실행에서 실행되지 않았다. launch1 합성 DNS 요청 6개, launch2 요청 0개, 페이지 오류 목록은 빈 배열이었다.

실패 메시지는 `page.waitForFunction: Timeout 15000ms exceeded.`, 호출 위치는 `dnsReady (.../test/browser/storage.smoke.mjs:48:45)`와 재시작 case의 `:91:217`이다. 첫 profile은 14:25:59.189 KST에 열리고 14:26:01.742에 닫혔다. 두 번째 profile은 14:26:02.012에 열리고 14:26:18.765에 닫혔다. 같은 임시 userDataDir의 실제 Chromium 재시작이 시도됐지만 성공 조건은 충족하지 못했다.

동일 소스 attempt2는 저장 15/15가 PASS였고 profile을 3회 열고 닫았다. launch1 합성 DNS 6개와 launch2 합성 DNS 10개가 기록됐다. 이는 새 JS context만 바꾼 검사가 아니라 GitHub Linux Chromium의 실제 임시 profile 재시작 검사다. 사용자 PC, Windows/iPhone/Android, canonical HTTPS의 전체 재시작 검증과는 별개다. 최초 실패를 외부 DNS 장애, 저장 데이터 손실, 원인 해결 중 어느 것으로도 단정하지 않는다.

## 최종 반환 기록

| 항목 | 상태 |
| --- | --- |
| 고정 구현 head / commit URL | 최종 커밋 후 기록 |
| PR URL / 원격 main SHA | 병합 후 실제 원격 조회로 기록 |
| 같은 최종 source CI / 실제 환경 | 실행 결과별 기록; 미실행은 NOT_RUN |
| 새 Cloudflare deployment ID / head SHA | 새 check 또는 provider 근거로 기록 |
| canonical root build-identity SHA / 검사 시각 | 실제 응답·root 동작 확인 후 기록 |
| 전후 같은 상태 캡처 / rect/font 근거 | 최종 browser artifact 경로·고정 source와 연결 |
| 제품 QA LAB | 같은 고정 source의 격리 로컬 HTML 1개, 실제 bytes/hash 연결 |
| 공식 QA / Bus / CURRENT | 본인 실행 기록만 갱신·재조회; 총괄 H 및 상대 ACK 보존 |

재현 기본 명령은 `npm test`, `npm run test:engine`, `npm run build`, `npm run build:qa-lab`다. 추가된 browser 검사 명령·결과는 실제 최종 소스에서 확인한다. QA fixture/보고서/LAB은 제품 `dist`에 포함하지 않는다.

`USER_APPROVED_LOWFI=NONE`, `G11=FAIL_USER_REWORK`, `P26=IN_REVIEW` 유지. 제품 게시 승인은 실가격·주문·결제·서버 DB 정책이나 사용자 최종 수락으로 확대하지 않는다. 주소 12안 기획 LAB은 별도 비교 자료이며 이번 제품 통합 LAB과 구분한다.

