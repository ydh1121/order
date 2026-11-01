# MSG0504 R10 CSS 정리 · 고정 UX c024

수정 파일은 `web/styles.css` 하나다. root가 인수한 MSG0505 HTML의 정확한 style 추출값에서 시작했다. UX 원본 HTML과 JS 모듈은 수정하지 않았다. 이 회차는 CSS 문법·불필요한 빈 블록·잘못된 값의 최소 정리이며, 브라우저 computed style/동일 상태 화면/성능 수락은 CI 후속 검사다.

| 기준 | 값 |
|---|---|
| UX HTML | 495,479B / SHA256 `c02467f859829b438b3142435fe4698f335c42bae592d9f32255774ffe210e16` |
| 정리 전 CSS | SHA256 `9b507e09260b8d76c59136b4231fe86977f4130a3910ae9fb8c3175335de34c6` |
| 정리 후 CSS | SHA256 `827febb13711e0ad0917099fc242987f2934b7157d431c5ccc270eac43406e67` |
| 정적 parser | Node v24.22.1 / PostCSS 8.5.29 |

## 실제 변경

아래 줄 번호는 정리 전 추출 CSS 기준이다(원본 HTML 줄 번호 아님).

| 위치 | 변경 | 이유·보존 범위 |
|---|---|---|
| 201 | 고립된 닫는 `}` 1개 제거 | strict PostCSS의 `Unexpected }` 해결. 실제 browser의 오류 복구 전후는 별도 확인 필요 |
| 545, 553, 1440, 1480 | 비어 있는 reduced-motion media 4개 제거 | 내부 node가 0개인 블록만 제거. 실제 reduced-motion 선언은 모두 유지 |
| 554 | 비어 있는 scrollbar-gutter supports 1개 제거 | 내용 없는 블록만 제거 |
| 1510 | 비어 있는 min-width:768px media 1개 제거 | 실제 mobile/desktop rule 유지 |
| 588 | `.q4-regular-dialog [aria-invalid=true]`의 invalid shadow를 `none`으로 명시 | `border-color:var(--ui-danger)` 유지 |
| 635 | Q2/Q3 invalid input selector의 invalid shadow를 `none`으로 명시 | `border-color:var(--ui-danger)` 유지 |

**단일 rule 내부의 정확한 중복 선언은 0개**였다. 서로 다른 rule의 같은 selector·property는 사이의 cascade와 상태를 바꿀 수 있어 이번에 제거하지 않았다. 선택자 블록 1,521개와 선언 4,786개는 그대로다. 이전 R10의 e13f 회복 AST 수치를 c024에 재사용하지 않았다.

## 토큰·상태 보존

원래 `box-shadow:0 0 0 1px var(--ui-danger)30`과 `...29`는 custom property 뒤에 alpha 문자열을 붙여 단일 색 token을 만들려는 잘못된 값이었다. var 치환은 token 단위이며 계산 시 무효가 되는 non-inherited 속성은 초기값을 사용한다. `box-shadow`의 초기값은 `none`이다. 이 규칙을 근거로 오류 border를 기존 `--ui-danger`에 남기고 shadow를 명시적 `none`으로 정리했다. 새 opacity·근사색·토큰을 만들어 새로운 halo를 추가하지 않았다. 실제 해당 selector가 이기는 상태의 값은 후속 브라우저에서 확인해야 한다.

근거: [W3C CSS Variables §3.1](https://www.w3.org/TR/css-variables-1/#invalid-variables), [W3C CSS Backgrounds box-shadow](https://www.w3.org/TR/css-backgrounds-3/#box-shadow).

| 역할 | 매핑 |
|---|---|
| invalid border | 기존 `var(--ui-danger)` → 동일 유지 |
| invalid shadow | 무효한 var-alpha 결합 → `none` |
| focus outline | 기존 `--ui-input-focus`/`--ui-danger` 및 후속 state rule 그대로 |
| U2 compact shell/transaction | c024의 `--ui-modal-inline`, variant, focus rule 그대로 |
| U3 editable month grid | c024의 one-row/column/pseudo 제외/`--ui-combo-inline` 그대로 |
| U4 비교 현재·변경·화살표 | c024의 neutral/blue 토큰과 responsive rule 그대로 |
| custom properties 전체 | selector·이름·값·important·순서가 정리 전과 동일 |

## 크기와 구조 검사

| 항목 | 전 | 후 | 차이 |
|---|---:|---:|---:|
| CSS raw bytes | 171,298 | 171,017 | −281 |
| CSS gzip level 9 bytes | 31,025 | 30,968 | −57 |
| selector rules | 1,521 | 1,521 | 0 |
| declarations | 4,786 | 4,786 | 0 |
| at-rules | 72 | 66 | −6 |
| strict parse | FAIL: line 201 | PASS | 문법 오류 해소 |

전 수치는 원문에서 오류 brace를 메모리에서만 비운 회복 AST, 후 수치는 원문 그대로 strict parse한 AST다. 허용한 2개 shadow 값과 빈 블록만 제외하고 모든 AST node·값·주석·순서가 동일함을 전수 비교했다. 파일 크기는 전송·렌더·입력 성능 측정이 아니며 성능 개선을 주장하지 않는다.

실행 명령(작업 디렉터리 `order`):

```sh
node ../evidence/check-r10-cleanup-0504.cjs \
  ../context/MSG0505-candidate.html web/styles.css \
  /workspace/scratch/f9beae23ea4e/ComeBackHome/node_modules/postcss \
  ../evidence/r10-cleanup-0504.json
```

결과: exit 0. 고정 HTML hash 및 CSS 시작 hash, 정확한 원문 parser 오류, empty block 6개, rule 내부 중복 0개, 허용된 값 변경 2개, 나머지 AST 순서/값 동일, custom property 동일, invalid var-alpha 제거, 원본 HTML 불변 확인. 재현 checker와 JSON 및 `r10-cleanup-0504.patch`는 evidence에 보관했다.

## 후속 CI 확인

정적 비교만으로 원문 browser의 오류 복구와 같은 cascade였다고 판단하지 않는다. 특히 제거한 `}` 바로 다음의 `.pair{column-gap:22px;row-gap:12px}`가 원문에서 어떻게 적용됐는지 Q2 실제 입력 grid의 computed gap/rect로 대조한다. 원문 c024와 고정 통합 commit을 같은 fixture/viewport/state에서 비교한다.

두 invalid selector가 적용되는 Q2/Q3/Q4 필드에서 normal/invalid/focus-visible의 border·outline·shadow, U2 동일 역할 버튼의 5상태 및 부모 inset/gap, U3 빈값/1/9/10/31/말일 grid, U4 좁은/넓은 비교 구조를 확인한다. reduced-motion과 767/768px 경계도 유지한다.

현재 판정: **정적 구조 검사 PASS / browser computed style NOT_RUN / 동일 상태 screenshot NOT_RUN / runtime performance NOT_RUN / 사용자 시각 수락 미주장**. 이 문서는 I09/I10 전체 완료를 뜻하지 않는다.
