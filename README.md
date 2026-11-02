# order.ooo
CODE1 산하 별도 프로젝트. 사업자용 계란 견적 산출, 공급 농가 등록, 증빙 기반 가격 재검토를 먼저 구현한다.

## 현재 상태
- Q1~Q4 입력·독립 검증/계산 코어·브라우저 입력 보존을 기존 제품 계보에서 개발 중이다. 판매 서비스 **미출시**.
- 개발 검토 정본은 기존 Cloudflare Pages 프로젝트 `order-ooo`의 https://order-ooo.pages.dev/ 이다. 실제 상품·농가·출고지역·승인 가격 데이터는 연결되지 않았다.
- 주소 선택1은 부모 사업장 초안에 주소 필드만 반영하고, 부모 저장에서 한 번 확정한다. 실제 정부 주소 검색은 이 프로젝트의 Production secret과 실제 HTTPS 응답 확인이 필요하다. 모의 검사나 코드 존재는 실제 연결 완료를 뜻하지 않는다.

## 정본 위치
- [기획](https://drive.google.com/drive/folders/1Y7nLy8bR760ZCDBSss0eyrxy2b5ljotI)
- [UI UX](https://drive.google.com/drive/folders/1ccmCQLgrS60WVP3-e5ZHGmpNjsxba1D8)
- [코딩](https://drive.google.com/drive/folders/1eiXMySMswZqCI41ns7LWcQZ1DL5BRdGB)

Figma 디자인 지정 페이지: https://www.figma.com/design/OGc2SUKEvckzYhhowzX7tD/code1?node-id=906-7544 — LOW-FI 초기 구현 이후 화면 지도 작성.

## 개발 명령
Node 22 이상에서 `npm ci` 후 실행한다.

- `npm test`: 독립 코어·브라우저 계약·저장/주소 서버 함수의 Node 검사.
- `npm run dev`: 로컬 정적 제품 실행. 이 서버는 Juso 키를 사용하거나 실제 주소 Function을 실행하지 않는다.
- `npm run build`: 검토한 파일 해시를 검사하고 `dist`를 생성한다. Pages 설정은 Framework None, build `npm run build`, output `dist`, root 빈칸, `NODE_VERSION=22`다.
- `npm run build:qa-lab`: 현재 고정 Git 소스에서 `.qa-lab/order-qa-lab.html` 한 파일을 만든다. 저장은 제품과 격리된 메모리이며 DNS·주소 모의 응답은 도구막대에서 명시적으로 선택한다. LAB은 `dist`에 들어가지 않는다.

`functions/api/address/search.js`는 기존 Pages Git 빌드가 컴파일한다. 공개 정적 자산으로 복사하지 않으며 `dist/_routes.json`은 `/api/address/search`만 Functions로 보낸다. 키는 Git·브라우저·LAB에 넣지 않는다. [주소 제공자 연결 및 설정](docs/address-provider.md)의 Production secret 절차와 미검증 범위를 따른다. Production `main` 자동 배포 ON / Preview None은 목표 계약이며, 저장된 공급자 설정의 실제 재조회와 배포 검증이 별도로 필요하다.

## 출시 금지 상태
모든 실제 접수 및 주문 API, 계좌·세무·개인정보·허가·가격 승인 정책 미연결. QA 통과/사업자 신청 완료를 주장하지 말 것.

## MSG0521 입력 유지·수량 재작업

입력 편집 팝업은 바깥 클릭으로 닫히지 않는다. 변경된 초안의 X·취소·Esc·뒤로가기는 공통 ‘계속 입력 / 변경 취소’ 확인을 거치며, 진행 중 저장 시도는 먼저 무효화한다. 미확정 입력을 자동 확정하지 않는다.

Q2 원수요, 알려진 사업장 수요, Q4 정수 포장계획은 별도 값이다. 저장 schema4는 기존 schema1–3을 검증해 이관하며, ONCE는 반복 월 배분에서 제외한다. Q2/Q4/날짜 숫자는 공통 unsigned-integer 입력 adapter를 사용한다. 전화와 우편번호는 별도 형식을 유지한다.

[MSG0521 구현 계약과 검증 경계](docs/engine/execution-0521.md)를 따른다. 실제 주소 제공자 성공, Cloudflare Preview None 설정, 사용자 OS 실기·최종 시각 수락은 코드/모의 검사와 별도 근거가 필요하다. LOWFI=NONE, G11=FAIL_USER_REWORK, P26=IN_REVIEW를 유지한다.

## MSG0526 정규본 Q4·공통 입력

[MSG0526 구현 계약](docs/engine/execution-0526.md)은 미채택 QA12를 대신해 기존 정규본을 수정한다. 공통 입력 증감·역할별 팝업과 FLEX/FIXED 폼을 재사용하며, schema5의 명시적 cadence가 14/21일 주기와 구형 주차 패턴을 구분한다. 납품 희망 일은 선택 입력이고, 원수요와 정수 포장계획은 별도 값으로 보존한다. 삭제된 참조월·주문 진행 입력은 저장의 숨은 필수 조건이 아니다.
