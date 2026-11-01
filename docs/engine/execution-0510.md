# MSG0510 — Q1~Q4 입력 유지와 로컬 QA LAB

이 보고서는 WO-ORDER-20261101-ASTRA-ENGINE-001의 MSG0510 후속 구현을 기록한다. 확정 입력의 저장·복원과 동일 제품 소스로 만든 로컬 QA LAB이 이번 변경 범위다. 아래 `PENDING_FINAL_READBACK`은 최종 커밋·원격 CI·배포 증거를 기록할 자리이며 PASS를 뜻하지 않는다.

공식 지시: [MSG0510](https://drive.google.com/file/d/1h-lV2neyfAjZM0p8J7SA5rsRlZcc3hEm/view). 기준 저장소는 [ydh1121/order](https://github.com/ydh1121/order), 정규 제품 주소는 [order-ooo.pages.dev](https://order-ooo.pages.dev/)다.

## 고정 소스와 원격 반환

| 항목 | 기록 |
| --- | --- |
| 기존 main / base SHA | `89fe5229059119280db4cdf9c361da508d5d0d36` |
| UX 인수 원본 | MSG0505, 495479 bytes, SHA-256 `c02467f859829b438b3142435fe4698f335c42bae592d9f32255774ffe210e16` |
| 이번 작업 branch / head SHA | `PENDING_FINAL_READBACK` |
| 이번 commit URL / PR URL | `PENDING_FINAL_READBACK` |
| 이번 원격 main SHA / 조회 시각 | `PENDING_FINAL_READBACK` |
| 같은 최종 SHA의 CI URL / 결과 | `PENDING_FINAL_READBACK` — 기존 CI 성공을 새 변경의 성공으로 사용하지 않음 |
| 최종 제품 build-identity / 파일 목록 | `PENDING_FINAL_READBACK` |
| 최종 LAB 소스 SHA / HTML SHA-256 / 다운로드 | `PENDING_FINAL_READBACK` — 전달본은 `EXACT_GIT_COMMIT`이어야 함 |
| 현재 canonical 관측 | 실행 담당자가 root의 F00과 `build-identity.json`을 실제 확인. 관측된 소스는 기존 main `89fe522…`, UX 출처는 c024. 시각·증거 경로는 `PENDING_FINAL_READBACK` |
| provider deployment ID / production source SHA | `NOT_VERIFIED` — 공개 build-identity 관측과 provider 배포 기록은 별개 |
| provider 설정 재조회 | `NOT_VERIFIED` — project/production 자동 배포/preview/build/root/Node 값의 실제 readback 필요 |

기존 PR #1, 이전 PR #2·#3 및 커밋 이력은 보존 대상이다. c024는 UX 인수 출처이며 현재 모듈 제품이나 LAB이 원본 HTML과 바이트 동일하다는 의미가 아니다. 원격 HEAD 조회·최종 CI 확인 전에는 이번 Git 누적 완료를 선언하지 않는다.

## 기존 코드와 이번 차이

| 구분 | 기존 main 89fe | 이번 구현 |
| --- | --- | --- |
| 저장 소유자 | `web/app.mjs`의 session R2/R1 읽기·쓰기, 실패를 반환하지 않는 저장 함수 | `web/storage.mjs`의 단일 versioned localStorage adapter와 앱 저장 대기열 |
| 보존 범위 | 브라우저 세션에 의존 | 같은 정상 브라우저·같은 origin의 확정 Q1~Q4 입력 |
| 확인/취소 | 저장 실패와 확인 완료의 연결이 부족 | 저장 결과를 기다린 뒤 확정·닫기. 실패/충돌은 원본과 입력 초안 유지, 취소된 대기 작업은 마지막 쓰기 전 차단 |
| 여러 탭 | 명시적 직렬화·revision 계약 없음 | 네이티브 Web Locks와 revision + 원문 해시 token으로 충돌 검출, 자동 병합 없음 |
| 초기화 | 지속 초기화 소유자 없음 | revision을 가진 `state: reset` 기록으로 옛 session/열린 탭의 값 부활 차단 |
| 검토 파일 | 독립 제품 소스와의 동일성·격리 계약 필요 | 현재 제품 ESM 그래프·HTML·CSS를 재사용한 로컬 HTML 한 파일, 출처 SHA 표시, 메모리 저장 격리 |
| Pages 명령 문서 | 오래된 `build:pages` 제안 잔존 | 실제 `npm run build` → `dist`, root 빈칸, `NODE_VERSION=22`로 문서 정정 |

저장 경계의 기존 11개 호출부와 Promise 소비자 검토는 [storage-boundaries-0510.md](storage-boundaries-0510.md)에 있다. 이 문서는 통합 전 소스 감사이며 런타임 PASS 증거가 아니다.

## 저장 계약

저장 키는 `order_q1_q4_v1`, 스키마는 `1`, 네이티브 잠금 이름은 `order-q1-q4-storage`다. 봉투에는 generation, revision, data/reset 상태, 데이터, transaction receipt, migration 출처, 수정 시각이 들어간다. adapter의 `load()`, `commit(payload, {expectedRevision, expectedToken, transactionId, canCommit})`, `reset(...)`는 성공·실패·충돌·취소를 구분한다. 쓰기 후 같은 원문이 읽히지 않으면 성공으로 처리하지 않고 불확실한 결과를 반환한다.

- stable ID, 단위, 연락처 원문, 정확한 유리수, manual/derived 출처, 월 배분 `monthlyDemandQty`와 회당 `qty`를 구분해 보존한다. 이전에 확인한 비활성 모드 입력은 유지하지만 현재 열린 모달의 미확정 초안은 확정값을 덮어쓰지 않는다.
- durable 기록이 없을 때만 session R2, 그 키도 없으면 R1을 검증해 이관한다. 손상·지원하지 않는 버전·reset은 미저장과 다르다. 이관 후에도 원본 session bytes를 유지하고 durable 기록을 우선한다.
- Q2 원문 입력은 즉시 화면에 반영하며 저장은 단일 대기열로 처리한다. 이전 쓰기의 완료가 나중 입력 원문을 덮어쓰지 않는다. 외부 탭 충돌은 자동으로 새 revision에 재적용하지 않는다.
- modal 확인은 불변 후보를 저장하고 성공 후 게시·닫기를 진행한다. 같은 transaction 재시도는 receipt로 중복 쓰기를 막고, 취소는 `canCommit`과 편집 세대로 마지막 쓰기 직전 확인한다.
- reset은 단순 `removeItem`이 아니다. 지속 tombstone/revision을 남겨 이전 탭과 session의 복원을 차단한다. 손상 기록도 일치하는 원문 token을 가진 명시적 reset으로만 정리한다.
- DNS/메일 검증 결과, pending 요청, 오류 노출·편집 상태는 영구 PASS로 저장하지 않는다. 복원 뒤 현 코어와 참조 자료·DNS/TTL 계약으로 다시 평가한다.
- 네이티브 Web Locks를 사용할 수 없으면 저장을 실패 상태로 반환한다. 단순 localStorage read-check-write를 탭 간 원자적 트랜잭션이라고 주장하지 않는다. 기기/계정 동기화와 서버 DB는 이번 범위에 없다.

## 재현 명령과 증거 슬롯

저장소 루트에서 실행한다. Playwright browser 설치가 필요한 환경은 기존 고정 버전 `playwright@1.64.1`의 Chromium을 사용한다. 설치된 별도 Chromium은 각 smoke의 `CHROME_PATH` 입력으로 지정하고 실제 버전을 결과에 남긴다.

```sh
npm ci
npm test
npm run test:engine
node --test test/engine/storage.test.mjs test/engine/qa-lab.test.mjs
npm run build
node test/browser/storage.smoke.mjs
npm run build:qa-lab
node test/browser/qa-lab.smoke.mjs .qa-lab/order-qa-lab.html
```

| 검사 | 확인된 중간 근거 / 최종 근거 |
| --- | --- |
| Node 전체 | 최종 pre-commit 실행 담당자 확인: 257 tests / 257 pass / 0 fail. 초기 `evidence/0510-node.log`의 251/251은 이전 실행 이력이다. 최종 로그 경로·고정 SHA 귀속은 `PENDING_FINAL_READBACK` |
| 엔진 subset / 고정 최종 Node | `PENDING_FINAL_READBACK` — 전체 검사와 subset 수를 합산하지 않음 |
| 통합 build | 최종 pre-commit 실행 담당자 확인: `INTEGRATED_PRODUCT`, 26 module/reference files, 643389 raw bytes / 179852 gzip bytes(identity/headers 제외). 미커밋 worktree 결과를 새 고정 SHA로 취급하지 않으며 최종 build identity는 별도로 연결 |
| 저장 browser 15 cases | 결과 JSON의 `status`, 각 `checks`, `profileLaunches`, `scope`, browser/build identity를 최종 소스와 함께 기록: `PENDING_FINAL_READBACK` |
| LAB browser 7 cases | 결과 JSON의 `status`, 각 `checks`, LAB HTML 해시, sourceState, bundleGraphSha256를 기록: `PENDING_FINAL_READBACK` |
| 기존 제품/전화/스타일/실제 HTTPS DNS 회귀 | 최종 커밋의 개별 결과만 추가: `PENDING_FINAL_READBACK` |
| 원격 CI | `PENDING_FINAL_READBACK` — 새 CI 성공을 아직 확인하지 않음 |

보고서 초안 작성 시 저장소의 `browser-evidence/storage/storage.json`과 `browser-evidence/qa-lab/qa-lab.json`은 `BLOCKED_BROWSER_ENVIRONMENT`, 실행된 case 0개였다. 이는 해당 실행 시도의 결과다. 별도 환경에서 성공한 실행이 있다면 경로·환경·소스 식별자를 함께 추가하며 이 차단 기록을 PASS로 바꾸어 읽지 않는다.

## 저장 browser 15개 case의 범위

`test/browser/storage.smoke.mjs`는 빌드한 제품을 임시 localhost HTTP origin에서 열고, 합성 연락처/DNS와 고유한 임시 persistent profile을 사용한다. 실제 Chromium·localStorage·Web Locks를 사용하는 경로이며 Node mock 검사와 구분한다. 아래 표는 구현된 검사 목록이다. 실행 성공 여부는 최종 JSON을 따른다.

| case | QA | 검증 내용 |
| --- | --- | --- |
| `S01_COMMITTED_Q1_Q4_ID_UNIT_SOURCE_AND_PRODUCT_RELOAD` | S01/S04 | 200, A50 manual/B150 derived, 회당10, stable ID/단위/원문과 새로고침 보존 |
| `S04_NEW_TAB_SAME_ORIGIN_ASSET_REFRESH_AND_DNS_RECHECK` | S04 | 새 탭 복원, DNS 재조회, 같은 로컬 origin의 통제된 asset revision 변경 |
| `S04_FULL_BROWSER_PROFILE_CLOSE_AND_RELAUNCH` | S04 | 임시 persistent profile의 실제 browser 종료·재실행 후 복원과 DNS 재조회 |
| `S02_PRODUCT_CANCEL_ESCAPE_AND_DUPLICATE_CONFIRM_ONE_WRITE` | S02 | 월 A60/B140 미확정 편집 취소, 중복 확인 한 revision, 월량/회당량 분리 |
| `S02_BROWSER_BACK_DROPS_UNCONFIRMED_DOCUMENT_DRAFT` | S02 | browser 뒤로가기 후 미확정 회당 원문이 durable 값에 남지 않음 |
| `S02_CANCEL_WHILE_REAL_WEB_LOCK_QUEUES_COMMIT` | S02/S03 | 실제 잠금 대기 중 취소, 잠금 해제 후 쓰기·닫힌 모달 오류 노출 없음 |
| `S03_PRODUCT_QUOTA_FAILURE_RETAINS_DRAFT_AND_DURABLE_DATA` | S03 | 제품 확인의 주입된 quota 실패, 모달/원문/기존 기록 유지와 재시도 |
| `S03_TWO_PRODUCT_TABS_STALE_Q2_DRAFT_AND_EXPLICIT_RESET` | S02/S03 | 두 제품 탭의 Q2 충돌 원문 유지, 명시 초기화와 stale 탭 부활 방지 |
| `S02_R2_AND_R1_MIGRATE_ONCE_KEEP_UNRELATED_SESSION` | S02 | R2/R1 최초 이관, durable 우선, 무관한 session 보존 |
| `S03_FAILED_MIGRATION_PRESERVES_ORIGINAL_SESSION` | S03 | 이관 쓰기 실패에서 session 원본 유지와 거짓 성공 없음 |
| `S03_CORRUPT_UNKNOWN_VERSION_NEVER_FALLBACK_OR_OVERWRITE` | S03 | 손상/미지원 durable은 session으로 대체되거나 자동 덮어써지지 않음 |
| `S03_NATIVE_WEB_LOCKS_CONCURRENT_WRITERS_AND_IDEMPOTENCE` | S02/S03 | 네이티브 잠금으로 동시 작성자 하나만 성공, 동일 receipt 재시도는 무추가 쓰기 |
| `S02_RESET_TOMBSTONE_BLOCKS_OLD_SESSION_AND_STALE_TAB` | S02/S04 | reset 기록의 탭·session·browser 재실행 이후 지속 |
| `S03_MISSING_WEB_LOCKS_FAILS_CLOSED` | S03 | 잠금 부재에서 저장 미수행 |
| `S04_NO_DURABLE_DNS_PASS_AND_NO_BROWSER_ERRORS` | S04 | 검증 증거의 영구 PASS 저장 금지, browser 오류와 profile 재실행 관측 확인 |

위 15개는 모든 SKU/단위/사업장 변경과 모든 확인 버튼 조합을 브라우저에서 전수 검사했다는 뜻이 아니다. 각각의 코어·제품 회귀와 함께 판정하고 검사하지 않은 조합을 PASS로 넓히지 않는다.

## 로컬 LAB 7개 case와 배포 제외

[qa-lab.md](qa-lab.md)의 builder는 제품 ESM 그래프, 원본 HTML/CSS, 엔진을 그대로 읽고 import specifier와 명시한 세 dependency wrapper만 바꾼다. 고정 commit과 소스별 SHA-256, 변환 모듈 해시, import-map digest를 HTML 안에 표시한다. 기본 build는 미커밋 소스를 거부한다. `--allow-dirty` 산출물은 개발 증거일 뿐 고정 전달본으로 사용하지 않는다.

저장은 실제 adapter에 주입한 격리 메모리, session 메모리와 LAB 안의 잠금이다. fixture는 명시적 버튼/고정 fragment 선택으로만 로드하며 빈 시작은 가격·사업장·연락처를 자동 채우지 않는다. 합성 예제의 가격 공란은 유지하며 browser 검사에서 입력한 값은 합성 값이다. embedded IANA도 기존 hash/freshness 계약을 적용하고 DNS는 기본 UNKNOWN, 명시적 example 경로만 합성 응답이다. CSP `connect-src 'none'`을 적용한다.

| case | QA | 검증 내용 |
| --- | --- | --- |
| `L01_SINGLE_FILE_SOURCE_IDENTITY_EMPTY_ISOLATED_BOOT` | S05 | 실제 file-origin 부팅, source 표시, 빈 입력, 네이티브 저장 접근 없음 |
| `L02_OPT_IN_FIXTURE_CURRENT_ENGINE_DERIVED_AND_CANCEL` | S01/S02/S05 | 명시 fixture, A50→60/B150→140 현재 코어 계산, 취소·ESC 무변경 |
| `L03_CONTROLLED_STORAGE_FAILURE_RETAINS_UNCONFIRMED_DRAFT` | S03/S05 | 한 번 실패 후 모달·원문 보존, 재시도 확정 |
| `L04_SECOND_WRITER_CONFLICT_BLOCKS_PRODUCT_CONFIRM` | S03/S05 | 두 번째 adapter 작성자의 revision으로 stale 확인 차단 |
| `L05_RESTART_IS_MEMORY_RESET_NOT_DURABLE_RESTORE` | S05 | LAB 재시작은 빈 메모리로 복귀하며 지속 복원 증거가 아님 |
| `L06_SAME_ORIGIN_NATIVE_PRODUCT_STORAGE_SENTINELS_UNTOUCHED` | S05/W03 | HTTP로 열린 LAB도 제품 local/session sentinel을 읽거나 변경하지 않음 |
| `L07_NO_EXTERNAL_NETWORK_OR_UNCAUGHT_PRODUCT_ERRORS` | S05 | 외부 요청 및 미처리 제품 오류 없음 |

LAB은 `dist` 밖의 `.qa-lab/order-qa-lab.html`로 생성하며 builder는 `dist` 하위 출력을 거부한다. production은 해시가 고정된 frontend allowlist와 검토된 엔진 closure만 출력한다. 최종 dist inventory에서 LAB, fixture, test harness, 보고서/private 자료 제외를 재확인한 근거는 `PENDING_FINAL_READBACK`이다. 공개 QA 경로·새 프로젝트·preview는 만들지 않는다.

## 공식 QA S01~S06 / W01~W04 연결

기존 `Q1_Q4_INTEGRATION_0504`의 I/U/W/A/H 판정과 E01~E16 이력을 보존한다. 아래는 새 근거의 연결 범위이며 기존 PASS를 소급 확장하지 않는다.

| ID | 연결할 구현·근거 | 남은 판정 경계 |
| --- | --- | --- |
| S01 | storage schema/투영, storage Node, browser 첫 case, LAB L02, 기존 수량·배분 코어 | 최종 고정 SHA와 실제 run JSON 귀속 |
| S02 | migration/receipt/tombstone/취소 token, Node 및 S02 browser cases | 사용자 PC 실기와 미검사 확인 버튼 조합 별도 |
| S03 | 실패/충돌 반환·앱 처리, Node 및 S03 browser/LAB L03~L04 | 합성 quota/실패 주입과 실제 운영 실패 관측 구분 |
| S04 | browser 새로고침·새 탭·persistent profile 종료/재실행·DNS 재평가 | localhost asset refresh는 canonical 후속 배포 증거가 아님 |
| S05 | builder 출처/격리 Node, LAB L01~L07, 최종 dist inventory | 고정 전달 HTML 해시/다운로드와 실제 browser 결과 추가 |
| S06 | package build, deployment 문서, 원격 SHA/CI, canonical build identity | 최종 원격 main→provider 배포 ID→root 연결 미확인 |
| W01 | 요청 설정: order-ooo/main 자동 ON/preview None, npm run build/dist/root 빈칸/Node22 | provider 실제 설정 readback `NOT_VERIFIED` |
| W02 | 실제 공개 canonical의 기존89fe build identity 관측, 원격 main/CI read | 새 SHA의 production deployment ID와 연결 `NOT_VERIFIED` |
| W03 | explicit dist allowlist, LAB 제외, 기존 PR/타 프로젝트 보존 | 최종 inventory·Git 보존 readback `PENDING_FINAL_READBACK` |
| W04 | canonical root F00 실제 관측 시작 | 이번 저장 변경의 Q1~Q4·상태·새로고침·지속 복원 검수 `PENDING_FINAL_READBACK` |

읽기 전용 GitHub 관측 `evidence/0510-provider-readonly.json`은 당시 main89fe, GitHub Actions check 3개 성공, 빈 commit statuses를 확인했다. deployments/hooks endpoint는 제공 커넥터의 지원 범위 밖이라 HTTP400으로 읽지 못했다. Cloudflare check가 없다는 사실로 연결 부재나 배포 부재를 추론하지 않는다. 이후 공개 root 접근 성공은 예전 root 접근 차단과 구분해 기록하며 provider dashboard/API 설정 확인까지 완료했다는 뜻으로 쓰지 않는다.

## 환경 제한과 최종 반환 체크

저장 browser suite의 실제 실행은 임시 Linux Chromium profile·localhost·합성 DNS 범위다. LAB은 file-origin 및 격리 HTTP sentinel 범위다. 이들을 canonical HTTPS의 실제 지속 저장, 실제 온라인 DNS, 사용자 Chrome profile, Windows/iPhone/Android, 공급가·주소 제공자·메일함 소유·실주문·전체 UX 수락으로 확대하지 않는다. 과거 0499/0504 검사 숫자와 이번 검사 숫자를 누적 합산하지 않는다.

최종 반환 시 새 commit/PR/remote main/동일 SHA CI, provider ID 또는 정확한 미확인 사유, canonical 동작 증거, 고정 LAB 파일과 해시, CURRENT/공식 QA/Bus 갱신 링크를 채운다. 현재 상태는 구현·검토 진행이며 사용자 최종 수락, P26 승인, LOWFI 수락을 대신하지 않는다.
