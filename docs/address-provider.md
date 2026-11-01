# MSG0519 주소 검색 연결 계약

기존 `order-ooo` Pages 안에서 `/api/address/search` 하나만 Function으로 실행한다. 브라우저의 개인정보·전화·이메일·상세주소·물품 장소는 검색 요청에 포함하지 않는다. 검색어와 페이지 번호만 같은 origin에 POST하고, Function은 고정된 정부 검색 API에 POST한다. 이 문서는 구현 계약이며 **실제 승인키 등록·제공자 검색 성공을 증명하지 않는다**.

## 모듈과 요청

| 소유자 | 입력 | 출력/제한 |
| --- | --- | --- |
| `functions/api/address/search.js` | `POST /api/address/search`, JSON `{query,page}` | `version:1`, `status`, `reason`, `items`, 성공 시 `page,total,hasMore` |
| `createAddressSearchHandler({fetcher,timeoutMs})` | 테스트에서만 의존 주입; 실제 `onRequest`는 native fetch/env 사용 | 고정 HTTPS 정부 호스트, 응답 64 KiB, provider timeout 5초, redirect 거부 |
| `web/address-service.mjs` | `createAddressSearchService({origin,fetcher,now,timeoutMs,cacheTtlMs})` | `.search(query,{page,signal})`, `.cancel()`, `.close()`, `.clearCache()`, 비식별 `.inspect()` |
| 주소 editor | composition/input과 편집 세대 | 조합 완료 후 최소2글자·300ms debounce; 결과 적용 세대 확인; 열기/모션/상세/물품 장소 편집으로 검색하지 않음 |

페이지는 1–20 정수, 한 번에10개로 고정한다. ASCII80자/비ASCII40자 상당의 가중 길이와 제어문자를 검사하며 요청 본문은1 KiB 이하다. 숫자 등 추가 검색 조건에 대한 제공자 오류는 `PROVIDER_ERROR`로 보존하고 결과 없음으로 바꾸지 않는다. 이 페이지·개수·timeout 수치는 제품 호출 예산이며 정부의 전체 서비스 한도라는 주장이 아니다.

`OK`와 `EMPTY`는 정상 제공자 응답을 검증한 결과다. 실패는 `UNAVAILABLE`이며 `NOT_CONFIGURED`, `PROVIDER_HTTP`, `PROVIDER_ERROR`, `NETWORK`, `TIMEOUT`, `BAD_RESPONSE`를 비식별 진단 코드로 구분한다. 요청 계약 위반은 `INVALID_REQUEST`, 취소 소비자는 `ABORTED`다. 고객 문구는 UI 소유자가 짧은 안내로 매핑하며 내부 코드·승인키·원본 제공자 오류 메시지를 표시하지 않는다.

선택 후보 한 건의 정규 필드는 다음과 같다. `providerId`는 정부 `bdMgtSn` 문자열, `postal`은 `zipNo` 문자열로 선행0을 유지한다.

```js
{
  road, postal, jibun, region,
  providerId,          // 25자리 건물관리번호
  addressProvider: 'JUSO'
}
```

검색 결과는 provider 형식 검사를 거친 뒤에만 반환한다. `roadAddrPart1`을 기준 도로명으로 사용하고 사용자가 입력한 상세주소를 별도 필드로 유지한다. `addressProvider`는 결과의 출처 표시이며 사용자 소유권·출입 가능·배달 가능을 인증하지 않는다. 단순 검색어, 구버전 수동 주소, 복원만으로 제공자 선택 완료가 되지 않는다. 실제 목록 선택·부모 초안 확인은 별도 주소 계약이 담당한다.

동일 검색어/페이지의 진행 요청은 공유하되 소비자 AbortSignal은 독립적이다. 마지막 소비자가 취소하면 제공자 요청을 취소하고 늦은 결과는 cache에 넣지 않는다. 성공/빈 결과만 최대30초·20항목의 세션 메모리에 재사용하며 실패·취소는 저장하지 않는다. HTTP 응답에는 `Cache-Control: no-store`를 붙인다. 검색 결과를 localStorage나 DB에 수집하지 않는다.

## 승인키가 아직 없거나 등록 여부를 확인할 수 없을 때

다음은 공식 공개 소스에서 확인한 설정 경로다. 인증된 신청 제출·키 보유·Cloudflare 저장 여부는 별도의 실제 확인 대상이다. 값은 채팅이나 Git에 보내지 않는다.

1. [주소정보 API 목록](https://business.juso.go.kr/jst/jstAddressApiList)에서 **도로명주소 → 검색 API**를 선택한다. [검색 API 안내](https://business.juso.go.kr/jst/jstRoadNmAddrApiSearch)의 **신청하기**를 통해 신청 화면으로 이동한다. 검색 항목 선택을 먼저 해야 신청 화면에 올바른 API 정보가 전달된다. 팝업·좌표·지도 API를 선택하지 않는다.
2. 신청의 시스템 명은 `order.ooo 사업장 소재지 검색`, URL(IP)은 `order-ooo.pages.dev`, 서비스망은 **인터넷 망**, 시스템 개요/신청사유는 `order.ooo에서 사업장 소재지를 검색하고 사용자가 선택한 주소를 입력하기 위함`으로 작성한다. 기관/신청자 정보는 실제 소유자가 입력한다. 지속적으로 사용할 지정 HTTPS 정본에는 서비스 용도를 **운영**으로 선택해 해당 시스템용 검색 승인키를 신청한다. 공개 양식의 **개발(본인인증없이 발급)** 키는7/30/90일 유효기간이 있는 임시 키이므로 지속 연결의 기본값으로 사용하지 않는다. 신청자 본인확인과 제출은 실제 소유자가 수행한다. 주소 API 운영키 사용은 실가격·주문·결제 등 상용 거래 승인을 뜻하지 않는다.
3. 발급 결과와 [마이페이지 API 인증키 관리](https://business.juso.go.kr/jsm/jsmApiList)에서 해당 시스템의 **검색** 승인키·유효기간을 확인한다. 다른 시스템 키·공개 예제키를 사용하지 않는다.
4. [Cloudflare 대시보드](https://dash.cloudflare.com/) → **Workers & Pages → order-ooo → Settings → Variables and Secrets → Production → Add**에서 이름을 `JUSO_SEARCH_KEY`로 정하고 값을 직접 입력한다. **Encrypt**를 선택한 뒤 **Save**한다. 키 값 확인을 위해 화면·로그·채팅으로 노출하지 않는다.
5. 이 secret을 사용하는 기존 main 배포를 실행하고 배포 ID와 main SHA를 확인한다. 새 프로젝트나 preview를 만들지 않는다. root의 주소 검색에서 실제 정부 후보 선택·부모 저장·새로고침이 확인되어야 실제 연결 완료다. `NOT_CONFIGURED`가 사라졌다는 사실이나 HTTP200만으로 완료하지 않는다.

기존에 사용하던 임시 키가 만료되거나 정부 응답이 실패하면 입력 초안은 유지되고 최종 주소 완료로 승격되지 않아야 한다. 새 키 등록 시 같은 프로젝트 Production secret만 갱신하고 기존 main 배포 경로를 사용한다.

## 배포 파일 경계

`functions/api/address/search.js`는 repo의 Functions 소스이며 `dist`에 정적 공개 파일로 복사하지 않는다. 빌드 출력 `_routes.json`은 `include:["/api/address/search","/api/address/search/"]`, `exclude:[]`로 주소 경로만 Functions에 보낸다. HTML/CSS/JS는 정적 제공을 유지한다. QA fixture, LAB, 증거·보고서, secret 파일은 공개 build allowlist에 넣지 않는다. Function은 다른 소스 import나 D1/Worker 프로젝트를 요구하지 않는다.

## 실제 확인과 아직 확인하지 않은 항목

`node --test test/engine/address-service.test.mjs`는 실제 서버·브라우저 모듈에 주입한 **합성 제공자 응답** 검사다. 고정 endpoint/POST·키 부재0호출·길이/페이지/형식/응답량·선행0·실패 구분·timeout·독립 취소·늦은 응답·cache TTL·통합 경로를 검사한다. IME/방향키/Tab/Esc/시각·실제 origin의 네트워크와 제공자 성공은 이 Node 검사와 별도로 기록해야 한다.

공식 소스 확인일: 2026-11-01 UTC. Juso의 기존 `/addrlink/openApi/searchApi.do`는 이번 조회에서404였다. 현재 안내/신청은 SPA 경로이며 검색 도구에 본문이 표시되지 않아 해당 공식 페이지가 참조한 JS를 읽었다. 신청·로그인·키 발급을 수행한 기록은 아니다. 별도 승인키 없는 공개 프로토콜 POST1회에서는 HTTP200/JSON 응답의 `E0001`(승인되지 않은 키) 및 `juso:null`을 확인했다. 이는 endpoint와 실패 형식 관측일 뿐, 제품 Production secret이나 실제 주소 검색 성공 근거가 아니다.

| 공식 공개 소스 | 확인 범위 |
| --- | --- |
| [현재 Juso 검색 안내](https://business.juso.go.kr/jst/jstRoadNmAddrApiSearch) | POST/GET endpoint, `confmKey/currentPage/countPerPage/keyword/resultType`, `roadAddrPart1/zipNo/bdMgtSn`, 길이 오류 안내 |
| [Juso 건물정보 규격](https://www.juso.go.kr/externalLink/goUrl?menuId=DT10) | 건물관리번호 문자25, 우편번호 문자5 |
| [현재 Juso 신청 화면](https://business.juso.go.kr/jst/jstAddressApiApplicationWrite) | 시스템명, URL(IP), 서비스망, 용도·기간, 신청자 입력 구분 |
| [Pages routing](https://developers.cloudflare.com/pages/functions/routing/) | repo `/functions` 파일 기반 routing, build directory `_routes.json` |
| [Pages secrets](https://developers.cloudflare.com/pages/functions/bindings/#secrets) | Variables and Secrets, Encrypt, Save, 다음 배포 전에 secret 설정 |

공식 JS 확인 바이트: 검색 안내 `jstRoadNmAddrApiSearch-3418888a.js` 23,218B SHA256 `784725410660d65f8d19ce2674b6818eb68f6862ade388e20c84cfda793fe636`; 신청 양식 `jstAddressApiApplicationWrite-5e49cabb.js` 22,963B SHA256 `9b4c4bd04f171eeb74edd6af342f3ede9651acb74c99c8b3bc90c14d8db58c02`. 원문 전체를 제품 코드에 복제하지 않았다.
