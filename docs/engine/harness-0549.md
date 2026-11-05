# MSG0549 실행·재개 연결

기존 WO-ORDER-20261101-ASTRA-ENGINE-001의 실행 도구다. 고객 제품 번들에 포함하지 않는다. Python 3.10+와 기존 Git만 사용하며 서비스, 계정, DB, 반복 예약을 만들지 않는다.

## 고정 원문

- Drive kit: `1j7XHz8WmIp18o7F16ClWzoyf7mnzxzW6`, v1.0.0.
- ZIP SHA256: `8bc8bba499526f737a1873a060efb161563333d45bbdfa2b557bde65a42a7763`.
- 보존 CLI SHA256: `98aacd1e120b9e35c63cd3d9cdb5a3884c3cad02e386d757278cb1cd3ba27eee`.
- `tools/order_harness/order_harness.py`는 수정하지 않았다. README, 원본 manifest, 라우터, provenance, 수락시험을 함께 보존한다. 원본 manifest의 verification 파일은 과거 결과이므로 제품 소스에 복사하지 않는다.
- `host.py`는 이 저장소의 어댑터다. 원본의 완료 action cache가 소스·증거를 재확인하지 않는 점과 기본 export가 완료 action ID를 누락하는 점을 보완한다.

## 실행 순서

아래 명령은 저장소 루트 기준이다. 실제 상태 경로는 실행방의 트랙별 외부 디렉터리를 사용한다. 현재 실행방은 `../context/0549/harness/astra-state`이며 이 경로는 다른 환경에서 다시 지정한다.

```sh
python tools/order_harness/order_harness.py --state-dir ../context/0549/harness/astra-state resume
python tools/order_harness/host.py --state-dir ../context/0549/harness/astra-state run \
  --action-id C55-UNIT-UNIQUE --scope c55_product_rework \
  --next '이번 검사 결과를 확인하고 다음 독립 작업 단위를 진행' -- npm test
python tools/order_harness/order_harness.py --state-dir ../context/0549/harness/astra-state checkpoint \
  --status UNIT_VERIFIED --next '다음 한 행동' --evidence /absolute/state/path/approved-result.json
```

초기 상태가 없을 때만 원본 README의 init을 사용한다. 실제 승인 scope와 보류를 기록한다. MSG0549는 C55/구조/기존5스킬/하네스 연결을 포함한다. PENDING-29 회사별 피팅, 월167 중심값, 근접 주기 허용 경계, ONCE 기간 통합은 자동 승인하지 않는다. 기록은 새 권한을 만들지 않는다.

`host.py run`은 명시한 argv를 `shell=False`로 실행한다. 실행 전 실제 HEAD·branch·변경파일 fingerprint, 실행 후 같은 정보와 receipt/log SHA256을 자동 checkpoint한다. 명령 출력은 로컬 파일로 남기고 기본 응답은 메타데이터만 반환한다. 선택적 `--excerpt-chars`는 2,000자 이하이다. 비밀키나 고객 증빙을 출력하는 명령을 감싸지 않는다.

같은 action ID는 다시 실행하지 않는다. 이전 결과의 소스·receipt·로그·checkpoint 증거가 바뀌거나 없으면 `STALE_ACTION_RESULT`다. 필요한 변경을 확인한 후 새 action ID로 새 검증을 기록한다. 같은 소스의 동일 실패 재시도는 `--retry-of`와 새 근거의 `--retry-reason`이 필요하다. 이 설명은 호출자의 검토 근거이며 자동 정당성 판정이 아니다.

한 상태 디렉터리에서는 동시에 한 명령만 실행한다. **각 병렬 담당자는 반드시 별도 상태 디렉터리를 사용하고 root만 astra-state를 쓴다.** root는 완료된 불변 요약을 복사하여 자기 CURRENT에 통합한다. 실제 실행 중 한 도구의 terminal FAILED 반환과 다른 호출에서 관찰한 RUNNING journal/짧아진 로그가 충돌했다. 원인은 확정되지 않았으며 단일 executor의 fcntl·fsync·atomic replace가 다중 도구의 파일 동기화까지 보장한다고 가정하지 않는다. 미확인 상태는 자동 재실행하지 않고 원본 tool receipt와 현재 증거 차이를 보존하여 수동 조정한다.

별도 Q4 상태에서도 terminal SUCCEEDED 반환과 이후 RUNNING 관찰이 충돌했으므로 상태 분리만으로 해결됐다고 판단하지 않는다. 두 호출 모두 기다림이 끝난 exec_command 응답이었으며 early yield 때문이라는 근거도 없다. 원인은 미확인이다. 현재 `host.py run`은 terminal receipt SHA256을 반환한다. bridge의 `prepare-durable --require-action ID --receipt-sha256 HASH`는 실제 디스크의 terminal receipt 및 로그 hashes가 그 반환값과 일치해야만 export한다. 달라지면 `TERMINAL_RECEIPT_PERSISTENCE_CONFLICT`로 원격 쓰기 전에 멈춘다.

이 호스트는 `/proc/self/status`에 host PID를 보여주지만 `task/children`을 노출하지 않았다. host 어댑터는 자기 자식의 pidfd fdinfo로 host PID를 확보하여 재사용된 namespace PID와 구분한다. 임의 프로세스나 명령행을 열거하지 않는다. Linux pidfd가 없거나 식별을 확보하지 못하면 기존 보수적 미확인 판정을 유지한다.

## 중단 후

`resume`는 새 프로세스에서 승인/보류·다음 행동·HEAD·변경파일·증거hash와 실행 생존을 비교한다. 살아 있는 wrapper/child와 결과 미확인을 구분한다. 재개는 저장·커밋·배포를 재실행하지 않는다. 중단된 action은 실제 프로세스 및 산출물을 관찰하고 원본 CLI의 `reconcile --external-state-checked --evidence ...`로만 조정한다. 결과가 미확인이거나 실행 중이면 같은 ID와 새 ID의 명령 모두 차단한다.

## 지속 저장 경계

`prepare-durable`의 JSON allowlist에는 검토한 정확한 저장소 상대 파일명만 쓴다. wildcard, 전체 작업트리 수집, symlink, 환경 파일, runtime/log 경로, binary, 검색 DB는 허용하지 않는다. source/checkpoint와 **모든 기존 action ID tombstone**만 포함한다. 원본 로그·명령 argv는 내보내지 않는다. 원본 저널 대신 checksum이 있는 정제 checkpoint 저널을 만든다. 명시적 source 파일은 `evidence/repo/`에 보관하며 restore가 제품 파일에 적용하지 않는다. 알려진 비밀 서명 검사는 보조이며 allowlist 내용 검토를 대신하지 않는다.

```sh
python tools/order_harness/host.py --state-dir ../context/0549/harness/astra-state prepare-durable \
  --allowlist /absolute/path/source-allowlist.json --output /absolute/outside/repo/checkpoint.zip
python tools/order_harness/host.py verify-durable \
  --envelope /absolute/path/checkpoint.envelope.json --downloaded /absolute/path/readback.zip \
  --remote-metadata /absolute/path/remote-metadata.json --receipt /absolute/path/durable-receipt.json
```

어댑터는 네트워크 요청을 하지 않는다. 실제 호스트는 승인된 Astra 폴더 `12c3k0H1C-PUaLqcMakRBlxComO8zvEB2`와 CURRENT `1p6b303fVYmHH7ekyyVaJE7zK-iaDq8D7`의 실제 메타데이터를 확인하고 ZIP을 업로드한 뒤 raw bytes를 다시 내려받는다. `remote-metadata.json`에는 실제 provider 응답의 `id`, `parents` 또는 `parent_ids`, 가능하면 `size`, `version`, `modifiedTime`을 기록한다. verify는 folder·size·SHA256이 맞아야 VERIFIED를 쓴다. 업로드 응답이 불명확하면 실제 파일/버전을 먼저 조회한다. helper의 `DURABLE_UPLOAD_PENDING`은 지속 저장 완료가 아니다. CURRENT 업데이트 및 재조회는 별도 확인이며 helper는 이를 성공으로 추정하지 않는다.

```sh
python tools/order_harness/order_harness.py --state-dir /new/empty/state restore \
  --archive /downloaded/checkpoint.zip --repo /existing/approved/order
python tools/order_harness/order_harness.py --state-dir /new/empty/state resume
```

복구 후 모든 기존 action ID가 보존된다. 로그는 내보내지 않으므로 관련 증거는 MISSING 또는 변경으로 표시되고 과거 PASS를 자동 재사용하지 않는다. 보관 source를 명시적으로 검토·복원하고 변경 영향만 재검증한다. 입력/출력 축소를 요금 절감률이나 사용량 한도 확대와 동일시하지 않는다.

## 실제 도구 호출을 묶는 code-mode 어댑터

`tools/order_harness/codex-bridge.js`의 `runAndCheckpoint({actionId, hooks})`는 호스트가 이미 제공한 도구 callback을 주입받는다. 자격증명·환경 변수·네트워크 클라이언트를 포함하지 않는다. 호출 한 번이 명령 영수증 → allowlist export → 승인된 폴더/CURRENT metadata 확인 → 업로드 → raw 재다운로드 → SHA/크기/부모 검증을 순서대로 수행한다.

| callback | 필수 계약 |
|---|---|
| loadIntent / saveIntent | 동일 action ID의 의도·진행을 전용 로컬 JSON에 atomic 보존 |
| run | host.py의 실제 terminal receipt 반환. RUNNING/미확인은 중단 |
| prepareExport | host.py의 전체 envelope JSON 반환 |
| verifyTargets | 실제 Drive metadata 확인 후 `{verified:true}` 반환 |
| findUploaded | 고정 uploadName을 실제 조회. 단일 `{id}`, 없음 null, 중복 `{ambiguous:true}` |
| upload | envelope의 정확한 ZIP을 기존 승인된 Drive folder에 업로드하고 `{id}` 반환 |
| readback | 그 ID의 실제 metadata와 raw bytes를 로컬 파일로 확보 |
| verifyDurable | host.py verify-durable의 검증 결과 반환 |

`UPLOAD_INTENT`를 저장한 후에만 쓰기를 시작한다. 전송 결과가 불명확하면 `UPLOAD_UNKNOWN`을 남긴다. 다음 호출은 실제 remote 조회로 조정하며 파일을 찾지 못해도 자동 재업로드하지 않는다. 이미 검증된 action ID는 과거 checkpoint임을 명시하고 재실행하지 않는다. 실패한 명령은 durable 보관에 성공해도 `COMMAND_FAILED_DURABLE_VERIFIED`로 남는다.

이것은 명시적으로 호출한 현재 호스트 도구의 연결이다. 대화/세션 시작·종료를 가로채는 unattended lifecycle hook, 계정 한도 후 자동 실행, 자동 무한 재시도가 아니다. 실제 연결 PASS는 code-mode 어댑터를 실제 도구에 연결한 호출 영수증과 owner Drive readback이 함께 있을 때만 기록한다.

## 검증

`python -m unittest discover -s tools/order_harness/tests -v`는 upstream fixture 시험과 adapter 회귀를 실행한다. `node --test tools/order_harness/tests/codex-bridge.test.mjs`는 도구 연결·실패 전파·불명확 업로드의 중복 방지를 확인한다. 실제 호스트의 명령·강제중단·새 프로세스 복구·지속 저장 증거는 별도 실행방 checkpoint에 기록한다. fixture PASS는 C55 제품·실제 주소 제공자·배포·상용 수락 PASS가 아니다.
