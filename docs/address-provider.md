# MSG0549 주소·장소 검색 연결 계약

현재 실행 경로는 기존 `order-ooo` Pages의 `/api/address/search` Function이다. MSG0519의 JUSO 검색 구현을 Kakao REST 검색으로 교체하되 이미 선택·저장된 JUSO 주소는 기존 출처를 유지한다. 키 등록 사실과 정적/모의 검사만으로 실제 배포의 검색 성공을 선언하지 않는다.

## 모듈과 출처

| 소유자 | 계약 |
| --- | --- |
| `functions/api/address/search.js` | 같은 origin의 `POST` 검색·선택 확인 JSON을 검사한 뒤 고정 Kakao 주소/키워드 endpoint에 요청. `KAKAO_REST_API_KEY`는 서버 Authorization 헤더에서만 사용 |
| `web/address-service.mjs` | v3의 주소/장소 구분·출처·페이지·후보 및 선택 결과를 엄격히 검증. 기존 v1 JUSO/v2 KAKAO 응답 호환. 독립 소비자 취소, 동일 요청 공유, 최대30초/20개 메모리 cache 유지 |
| `web/address-contract.mjs` | `JUSO` 25자리 건물번호와 `KAKAO` 이름공간의 선택 식별자를 구분. 사용자 상세주소와 물품 장소는 제공자 응답에서 받지 않음 |
| `web/address-ui.mjs` | 검색·후보 이동·주소 확인은 부모 사업장 초안만 변경. 부모 저장에서만 기존 저장 adapter를 호출 |
| `web/storage.mjs` | KAKAO와 JUSO 출처를 엄격히 직렬화/복원. 옛 수동 주소를 제공자 검증으로 승격하지 않음 |

고정 upstream은 `GET https://dapi.kakao.com/v2/local/search/address.json`과 `GET https://dapi.kakao.com/v2/local/search/keyword.json` 두 경로다. 둘 다 `Authorization: KakaoAK {REST_API_KEY}`를 사용한다. 응답은 `documents`와 `meta.total_count/pageable_count/is_end`를 제공한다. 주소 endpoint의 도로명주소·우편번호는 `road_address.address_name/zone_no`에서 읽는다. 장소 endpoint는 `id/place_name/road_address_name/address_name`만 선별하며 좌표·URL·전화번호를 브라우저에 전달하지 않는다. 장소 응답에 우편번호가 있다고 가정하지 않는다. 공식 문서: [Kakao 로컬 REST API](https://developers.kakao.com/docs/ko/local/dev-guide) (2026-11-05 문서 확인; 실제 API 호출 아님).

선택 결과 정규 필드는 기존 그대로다.

```js
{ road, postal, jibun, region, providerId, addressProvider: 'KAKAO' }
```

`providerId`의 `KAKAO:v1:` 뒤64자리 소문자 hex는 주소 후보에서는 `[정규화 도로명주소, 우편번호]`, 장소 선택에서는 `['PLACE', 장소ID, 정규화 도로명주소, 우편번호]` JSON 배열의 SHA-256이다. **제품 내부의 후보 동등성 식별자**이며 Kakao가 발급한 건물번호나 주소 소유·배송 가능 인증이 아니다. 같은 건물의 다른 매장은 서로 다른 ID를 유지하고, 같은 장소가 다른 주소로 이전해도 이전 상세주소·물품 장소를 유지하지 않는다. 장소명·지점명은 후보 및 해당 자식 팝업의 선택 결과에 표시하고, 부모/저장은 기존 주소 필드만 사용한다. 우편번호는5자리 문자열로 선행0을 유지한다. 출처가 달라도 도로명주소·우편번호가 정확히 같을 때만 상세주소·물품 장소를 보존한다.

## 검색과 선택 확인

| 같은 origin POST 본문 | 동작 | cache miss의 upstream 호출 |
| --- | --- | --- |
| `{query,page}` | 같은 검색어로 주소와 장소를 조회. 장소명/지점·주소를 구분해 표시 | 주소1 + 키워드1 |
| `{action:'resolve',query,page,placeId}` | 원래 키워드 페이지에서 선택ID를 다시 확인한 뒤, 그 장소 한 건의 도로명주소(없으면 지번)만 우편주소 조회 | 키워드1 + 선택 주소1 |

선택 확인 요청은 임의 주소·이름·URL을 받지 않는다. 제공자 페이지에서 ID가 사라지면 `PLACE_CHANGED`, 선택 장소와 정확히 일치하는 정규 주소가 한 건이 아니면 `POSTAL_UNAVAILABLE`이다. 우편번호를 추정하거나 후보 전체를 추가 조회하지 않는다. 이미 우편번호가 있는 주소 후보의 선택은 추가 요청0이다. 이 표는 코드상 cache miss 경로이며 실제 제공자 과금/transport 관측 수가 아니다. 같은 소비자 요청 공유·cache가 적용되면 실제 호출은 줄어들 수 있다.

## 요청·응답 한도

제품 한도는 검색어 최소2글자, ASCII80자/비ASCII40자 상당, 페이지1–20, 제공자 종류별10개/합계최대20개, 본문1KiB, 제공자별 응답64KiB, 브라우저 응답64KiB, 제공자 전체 작업5초다. 공급자의 최대값을 모두 노출하는 계약이 아니다. 브라우저는 위 표의 필드만 same-origin POST하고 전화·이메일·상세주소·물품 장소를 보내지 않는다. 제공자 요구에 따라 서버는 검색어를 upstream query parameter로 전달하므로 upstream URL/헤더를 로그에 남기지 않는다. 임의 URL·호스트·redirect·추가 조건은 받지 않는다.

v3 검색 성공 응답은 `version,status,reason,items,page,total,hasMore,sources`이다. `sources.address/place`는 각 `total,pageable,hasMore`를 보존한다. ADDRESS 후보는 기존 정규 필드와 `kind:'ADDRESS'`, PLACE 후보는 `kind,placeId,name,road,jibun,page,addressProvider`만 가진다. 선택 확인 성공은 `version:3,status:'OK',reason:'RESOLVED',placeId,item`이다. 알 수 없는 필드·중복ID·다른 페이지·잘못된 출처·부분 페이지 메타데이터는 cache에 넣지 않는다.

지역명/도로명만 있고 건물 도로명주소·우편번호가 없는 주소 후보 및 주소가 전혀 없는 장소 후보는 제외한다. `NO_SELECTABLE_ADDRESSES`는 결과 없음과 구분해 구체적인 입력을 안내한다. 후속 페이지가 필터 후 비어도 기존 목록과 누적 수를 유지하고 각 제공자의 `is_end`로 더보기를 결정한다. 더보기 실패 때는 기존 목록을 숨기거나 페이지를 증가시키지 않으며 같은 실패 페이지를 재시도한다. 자동 다음 페이지 요청은 없다.

키 없음은 `NOT_CONFIGURED`, 인증 거부는 `PROVIDER_AUTH`,429는 `PROVIDER_QUOTA`, 그 밖의 HTTP 오류는 `PROVIDER_HTTP`로 구분한다. 네트워크·시간초과·형식 오류·취소도 별도로 유지한다. 제공자의 원문 오류나 요청·키는 반환/로그/화면에 노출하지 않는다. 실패를 빈 결과 또는 성공으로 바꾸지 않는다. UI는 짧은 실패 안내와 기존 재시도만 표시한다.

기존300ms/IME 계약, 검색 취소·세대 검사, 성공/빈 결과의 짧은 세션 메모리 재사용은 유지한다. 검색 결과 전체를 localStorage나 DB에 저장하지 않는다. HTTP 응답은 `no-store`다. 상세주소·물품 장소 편집 및 팝업 모션에는 추가 API 요청이 없다.

## 기존 Production 설정 확인

이번 코드에는 `KAKAO_JAVASCRIPT_KEY`와 SDK가 필요하지 않다. 사용자가 이미 등록했다고 알려준 두 키를 모두 사용하기 위해 불필요한 요청을 추가하지 않는다. GitHub secret은 Pages Function의 환경 바인딩과 동일하지 않다.

기존 Cloudflare **Workers & Pages → order-ooo → Settings → Variables and Secrets → Production**에서 `KAKAO_REST_API_KEY` 이름·존재·환경만 확인한다. 값은 읽어 출력하거나 Git·LAB·스크린샷·채팅에 넣지 않는다. 이 변경이 포함된 기존 main 배포와 배포 ID를 대조한다. 인증 거부 시에는 기존 Kakao 앱의 REST 키 종류 및 적용 제한을 확인하되 키 부재나 특정 과거503 원인으로 단정하지 않는다. 새 프로젝트·키·지도·좌표 조회·D1은 만들지 않는다.

실제 제공자 검증은 최신 MSG0549의 소수 대표 사례(엽기떡볶이 언주역·서울시청·관악구청 및 도로명 대조군)에 대해 별도 승인 범위에서 수행한다. 자동 반복·페이지 확장·후보 전체 확인은 하지 않는다. 장소 선택→단일 우편주소 확인→부모 저장→새로고침까지 검색별 논리 요청과 관측된 transport를 분리 기록한다. 도로명 검색 성공만으로 장소 검색을 통과 처리하지 않는다. 이 변경의 로컬 구현 검사는 실제 provider 성공 증거가 아니다.

## 배포 및 검사 경계

기존 `_routes.json`은 주소 경로만 Functions로 처리한다. `functions` 소스는 정적 dist에 복사하지 않는다. HTML/CSS/JS는 정적으로 제공하고 QA/LAB/fixture/증거/키는 dist에서 제외한다.

`node --test test/engine/address-service.test.mjs test/engine/c55-address.test.mjs test/engine/address-contract.test.mjs test/engine/address-ui.test.mjs test/engine/address-storage.test.mjs`는 실제 모듈의 **합성 Kakao 응답/DOM mock/메모리 저장** 검사다. 외부 API 조회는0회다. `test/browser/c55-address.smoke.mjs`는 동일 빌드의 실제 Chromium 화면/저장과 합성 제공자 경로를 검사하도록 작성했으며 실행 결과가 있어야 브라우저 PASS를 기록한다. 실제 Production secret 적용, provider 성공, 정본 배포는 별도 근거가 필요하다. 예전 JUSO503 원인은 이번 adapter 변경만으로 해결 처리하지 않는다. JUSO 구현·검사·신청 설명의 역사 원문은 이 저장소의 MSG0519~MSG0528 Git 이력에 남아 있다.

## MSG0543 Workers 요청 호환 보수

서버의 `fetch(url, init)`은 `redirect: 'manual'`을 사용한다. Workers는 표준 Fetch의 `error` 모드를 지원하지 않아 요청 생성 단계에서 `TypeError`를 발생시킨다. 이전 코드는 그 예외를 `NETWORK`로 축약했다. `manual`은 3xx를 그대로 반환하며 기존 `!response.ok` 검사에서 `PROVIDER_HTTP`로 거부한다. Location을 따라가거나 다른 호스트로 Authorization을 전달하지 않는다. 브라우저의 same-origin `redirect: 'error'`는 지원되는 별도 경로로 유지한다.

공식 근거: [Workers Request](https://developers.cloudflare.com/workers/runtime-apis/request/#constructor). 이 코드 결함 확인은 Production 과거 예외 로그 열람이나 키 인증 성공의 증거를 대신하지 않는다. 실제 검색은 수정 배포 후 위 최신 대표 사례 범위로 따로 확인한다. Node 합성 검사에는301/302/303/307/308 미추적·추가 요청0·원문/키 미노출을 포함한다. 이 redirect 보수는 두 고정 upstream 경로와 선택 확인 경로에도 유지한다.
