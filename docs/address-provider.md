# MSG0540 주소 검색 연결 계약

현재 실행 경로는 기존 `order-ooo` Pages의 `/api/address/search` Function이다. MSG0519의 JUSO 검색 구현을 Kakao REST 검색으로 교체하되 이미 선택·저장된 JUSO 주소는 기존 출처를 유지한다. 키 등록 사실과 정적/모의 검사만으로 실제 배포의 검색 성공을 선언하지 않는다.

## 모듈과 출처

| 소유자 | 계약 |
| --- | --- |
| `functions/api/address/search.js` | 같은 origin의 `POST` JSON `{query,page}`를 검사한 뒤 고정 Kakao 주소 검색 endpoint에 요청. `KAKAO_REST_API_KEY`는 서버 Authorization 헤더에서만 사용 |
| `web/address-service.mjs` | 성공 응답 v2의 KAKAO 출처·페이지·후보를 검증. 기존 v1 JUSO 응답 호환. 독립 소비자 취소, 동일 요청 공유, 최대30초/20개 메모리 cache 유지 |
| `web/address-contract.mjs` | `JUSO` 25자리 건물번호와 `KAKAO` 이름공간의 선택 식별자를 구분. 사용자 상세주소와 물품 장소는 제공자 응답에서 받지 않음 |
| `web/address-ui.mjs` | 검색·후보 이동·주소 확인은 부모 사업장 초안만 변경. 부모 저장에서만 기존 저장 adapter를 호출 |
| `web/storage.mjs` | KAKAO와 JUSO 출처를 엄격히 직렬화/복원. 옛 수동 주소를 제공자 검증으로 승격하지 않음 |

Kakao 공식 REST 문서의 주소 검색은 `GET https://dapi.kakao.com/v2/local/search/address.json`이며 `Authorization: KakaoAK {REST_API_KEY}`를 사용한다. 응답은 `documents`와 `meta.total_count/pageable_count/is_end`를 제공한다. 도로명주소·우편번호는 `road_address.address_name/zone_no`에서 읽는다. 이 API에는 JUSO 건물관리번호나 Kakao 장소 ID가 없으므로 그 값을 만들어 가장하지 않는다. 공식 문서: <https://developers.kakao.com/docs/ko/kakaomap/rest-api> (2026-11-05 실행 중 확인).

선택 결과 정규 필드는 기존 그대로다.

```js
{ road, postal, jibun, region, providerId, addressProvider: 'KAKAO' }
```

`providerId`의 `KAKAO:v1:` 뒤64자리 소문자 hex는 NFC·공백 정규화한 도로명주소와 우편번호 JSON 배열의 SHA-256이다. **제품 내부의 후보 동등성 식별자**이며 Kakao가 발급한 건물번호나 주소 소유·배송 가능 인증이 아니다. 선택 주소만 저장하며 제공자 좌표/건물명/원문 응답은 버린다. 우편번호는5자리 문자열로 선행0을 유지한다. 같은 출처에서 같은 ID를 재선택하면 선택 입력을 보존한다. 출처가 달라도 도로명주소·우편번호가 정확히 같을 때만 상세주소·물품 장소를 보존한다.

## 요청·응답 한도

제품 한도는 검색어 최소2글자, ASCII80자/비ASCII40자 상당, 페이지1–20, 한 번10개, 본문1KiB, 응답64KiB, 제공자5초다. 공급자의 최대값을 모두 노출하는 계약이 아니다. 브라우저는 query/page만 same-origin POST하고 전화·이메일·상세주소·물품 장소를 보내지 않는다. 제공자 요구에 따라 서버는 검색어를 upstream query parameter로 전달하므로 upstream URL/헤더를 로그에 남기지 않는다. 임의 URL·호스트·redirect·추가 조건은 받지 않는다.

v2 성공 응답은 `version,status,reason,items,page,total,pageable,hasMore`이다. 지역명/도로명만 있고 건물 도로명주소·우편번호가 없는 정상 후보는 선택 대상에서 제외한다. 정상 응답의 비선택 후보와 잘못된 응답을 구분한다. 중복 후보는 같은 식별자로 합치며 다음 페이지는 제공자 `is_end`와 제품 페이지 한도를 따른다. 자동 다음 페이지 요청은 없다.

키 없음은 `NOT_CONFIGURED`, 인증 거부는 `PROVIDER_AUTH`,429는 `PROVIDER_QUOTA`, 그 밖의 HTTP 오류는 `PROVIDER_HTTP`로 구분한다. 네트워크·시간초과·형식 오류·취소도 별도로 유지한다. 제공자의 원문 오류나 요청·키는 반환/로그/화면에 노출하지 않는다. 실패를 빈 결과 또는 성공으로 바꾸지 않는다. UI는 짧은 실패 안내와 기존 재시도만 표시한다.

기존300ms/IME 계약, 검색 취소·세대 검사, 성공/빈 결과의 짧은 세션 메모리 재사용은 유지한다. 검색 결과 전체를 localStorage나 DB에 저장하지 않는다. HTTP 응답은 `no-store`다. 상세주소·물품 장소 편집 및 팝업 모션에는 추가 API 요청이 없다.

## 기존 Production 설정 확인

이번 코드에는 `KAKAO_JAVASCRIPT_KEY`와 SDK가 필요하지 않다. 사용자가 이미 등록했다고 알려준 두 키를 모두 사용하기 위해 불필요한 요청을 추가하지 않는다. GitHub secret은 Pages Function의 환경 바인딩과 동일하지 않다.

기존 Cloudflare **Workers & Pages → order-ooo → Settings → Variables and Secrets → Production**에서 `KAKAO_REST_API_KEY` 이름·존재·환경만 확인한다. 값은 읽어 출력하거나 Git·LAB·스크린샷·채팅에 넣지 않는다. 이 변경이 포함된 기존 main 배포와 배포 ID를 대조한다. 인증 거부 시에는 기존 Kakao 앱의 REST 키 종류 및 적용 제한을 확인하되 키 부재나 특정 과거503 원인으로 단정하지 않는다. 새 프로젝트·키·지도·좌표 조회·D1은 만들지 않는다.

정적/모의 검사가 끝난 뒤 실제 공개 주소 대표 검색 **1건**만 호출한다. 자동 반복·페이지 확장·주소별 반복은 하지 않는다. 결과 선택→부모 저장→새로고침까지 검수한다. 실패하면 비밀값 없는 상태와 요청1건을 기록하고 연속 탐색하지 않는다.

## 배포 및 검사 경계

기존 `_routes.json`은 주소 경로만 Functions로 처리한다. `functions` 소스는 정적 dist에 복사하지 않는다. HTML/CSS/JS는 정적으로 제공하고 QA/LAB/fixture/증거/키는 dist에서 제외한다.

`node --test test/engine/address-service.test.mjs test/engine/address-contract.test.mjs test/engine/address-ui.test.mjs`는 실제 모듈의 **합성 Kakao 응답/DOM mock** 검사다. 외부 조회는0회다. 실제 Production secret 적용, provider 성공, 브라우저 검색·부모 저장·복원은 별도 실행 근거가 필요하다. 예전 JUSO503 원인은 이번 adapter 변경만으로 해결 처리하지 않는다. JUSO 구현·검사·신청 설명의 역사 원문은 이 저장소의 MSG0519~MSG0528 Git 이력에 남아 있다.
