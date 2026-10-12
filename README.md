# order.ooo
CODE1 산하 별도 프로젝트. 사업자용 계란 견적 산출, 공급 농가 등록, 증빙 기반 가격 재검토를 먼저 구현한다.

## 현재 상태
- 코드 기반 초기화 및 화면/데이터 계약 도입 중. 판매 서비스 **미출시**.
- 실제 상품·농가·출고지역·승인 가격 데이터는 연결되지 않았다. 견적에 허위 가격을 표시하지 않는다.
- 백엔드 기술, 대금 수취 주체, 배포 대상은 아직 결정하지 않았다.

## 정본 위치
- [기획](https://drive.google.com/drive/folders/1Y7nLy8bR760ZCDBSss0eyrxy2b5ljotI)
- [UI UX](https://drive.google.com/drive/folders/1ccmCQLgrS60WVP3-e5ZHGmpNjsxba1D8)
- [코딩](https://drive.google.com/drive/folders/1eiXMySMswZqCI41ns7LWcQZ1DL5BRdGB)

Figma 디자인 지정 페이지: https://www.figma.com/design/OGc2SUKEvckzYhhowzX7tD/code1?node-id=906-7544 — LOW-FI 초기 구현 이후 화면 지도 작성.

## 개발 명령
Node 22 이상. `npm test` 가격 계산의 계약검증. `npm run dev` 로컬 미리보기 (실제 주문 접수/결제 없음).

## 출시 금지 상태
모든 실제 접수 및 주문 API, 계좌·세무·개인정보·허가·가격 승인 정책 미연결. QA 통과/사업자 신청 완료를 주장하지 말 것.
