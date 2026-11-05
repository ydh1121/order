# order.ooo 경량 작업 하네스 킷

이 킷은 **실행 가능한 로컬 CLI**다. 과업에 맞는 고정 원문 선택, 큰 로그의 선택 검색, 작업 단위 체크포인트, 명령 영수증, 중단 후 복구 확인을 제공한다. Python 3.10+ 표준 라이브러리만 사용한다. Git은 소스 상태 확인에 사용하며, 검색에는 Python에 포함된 SQLite FTS5가 필요하다.

**완료 범위:** 아래 CLI와 격리된 수락시험. **아직 연결되지 않은 범위:** 실제 order 저장소, 아스트라 호스트의 자동 훅, Drive 자동 업로드. 제품 기능·배포·C55 수락 검증이 이 킷의 시험으로 완료되는 것은 아니다.

## 1. 시작과 권한 범위

한 작업 트랙은 한 상태 디렉터리를 사용한다. 여러 트랙이 같은 CURRENT를 덮어쓰지 않는다. 다음 경로를 실제 위치로 바꾼다.

    ORDER_KIT=/path/to/order_harness_kit
    ORDER_REPO=/path/to/order
    ORDER_STATE="$ORDER_REPO/.order-harness"

    python3 "$ORDER_KIT/order_harness.py" --state-dir "$ORDER_STATE" init \
      --project order.ooo --track ASTRA_ENGINE_EXECUTION \
      --repo "$ORDER_REPO" \
      --routes "$ORDER_KIT/data/skill_routing.json" \
      --allow-scope harness_source_ops \
      --allow-scope harness_integration \
      --allow-scope c55_product_rework \
      --allow-scope structure_refactor \
      --hold design_fitting \
      --approvals-note "최신 통합지시 범위만 허용. 기존 승인 UI·제품 계약 유지. 미승인 정책 제안은 자동 채택하지 않음." \
      --next "최신 통합 지시와 실제 소스 차이를 확인"

이 허용 목록은 호출자가 이미 받은 지시를 **기록**한다. 추가 권한을 부여하지 않는다. 이전의 포괄 보류를 계속 강제하지 않으며, 이번 사용자 지시에서 대기시킨 design_fitting을 별도로 유지한다. 실제 기존 WO·제품 계약·다른 트랙 소유권이 우선한다.

init은 기존 상태를 덮어쓰지 않는다. 다음 세션에는 init을 반복하지 않고 resume부터 사용한다.

## 2. 현재 과업의 원문만 고르기

    python3 "$ORDER_KIT/order_harness.py" --state-dir "$ORDER_STATE" route --list
    python3 "$ORDER_KIT/order_harness.py" --state-dir "$ORDER_STATE" route --task c55_rework --record
    python3 "$ORDER_KIT/order_harness.py" --state-dir "$ORDER_STATE" route --task component_ui
    python3 "$ORDER_KIT/order_harness.py" --state-dir "$ORDER_STATE" route --task resume
    python3 "$ORDER_KIT/order_harness.py" --state-dir "$ORDER_STATE" route --task design_fitting

실제 데이터는 **28개 과업·126개 저장소 바인딩**이다. design_fitting은 빈 후보와 DEFERRED를 반환한다. C55·구조 정리·공통 UI에는 기존 better-layout/MIFB 기준을 유지한다.

출력에는 고정 commit, 진입 경로, 보관 위치, 라이선스 확인 상태, 사용 조건과 설치 준비 여부가 들어 있다. 선택 결과는 SELECTED_NOT_READ_OR_APPLIED다. 해당 원문과 필요한 참조를 실제로 읽고 적용 근거를 남기는 일은 실행 에이전트가 한다.

    python3 "$ORDER_KIT/order_harness.py" --state-dir "$ORDER_STATE" select \
      --repository lilmgenius/paperthin

paperthin은 catchup/re0-memo의 읽기·증거 전달 원칙만 참고한다. v0 재시작, 전체 패키지 설치, 반복 실행 루프를 가져오지 않았다. 이 킷의 체크포인트 코드는 별도로 작성했다.

원문 전체와 누락 명세는 원래 ZIP manifest에 있다. 이 킷은 원문을 실행하거나 설치하지 않는다. --max-paths는 표시할 경로 수이며, 생략한 참조가 불필요하다는 판정은 아니다. 기존 5개 ZIP의 정확 prefix를 이 자료에서 확인하지 못한 경우 extraction_ready=false가 유지된다.

## 3. 큰 로그를 파일로 저장한 뒤 검색

    python3 "$ORDER_KIT/order_harness.py" --state-dir "$ORDER_STATE" index add /path/to/test.log
    python3 "$ORDER_KIT/order_harness.py" --state-dir "$ORDER_STATE" search "주소 저장" \
      --limit 5 --excerpt-chars 500 --max-output-chars 4000
    python3 "$ORDER_KIT/order_harness.py" --state-dir "$ORDER_STATE" index stats

인덱싱은 지정한 파일에만 적용하며 원본을 수정하지 않는다. 같은 hash의 파일은 다시 색인하지 않는다. 결과는 문서 ID·줄 범위·원문 hash·짧은 발췌로 제한된다. 검색의 METADATA_UNCHANGED는 파일 크기·수정 시각 확인이며 내용의 재해시 검증을 뜻하지 않는다. 실제 검증 증거는 다음 체크포인트의 SHA256으로 확인한다.

일반적인 비밀 파일 이름(.env, 개인 키 등)은 입력에서 제외한다. 환경 변수 전체를 수집하지 않으며 외부로 전송하지 않는다. 로그 안에 출력된 모든 비밀 값을 자동 탐지하는 도구는 아니므로 로그를 외부에 보관할 때는 실제 내용과 기존 프로젝트 규칙을 확인한다.

## 4. 명령 실행 전후를 자동 기록

    python3 "$ORDER_KIT/order_harness.py" --state-dir "$ORDER_STATE" run \
      --action-id C55-ADDRESS-UNIT-001 --scope c55_product_rework -- \
      python3 /path/to/approved-local-test.py

호출자가 명시한 로컬 명령만 shell=False로 실행한다. 시작 전 PREPARED, 실행 중 RUNNING, 정상 종료 후 결과 영수증과 stdout/stderr 파일의 hash를 저장한다. 기본 출력은 로그 본문을 포함하지 않는다. 필요할 때만 --excerpt-chars 500으로 작은 꼬리 구간을 요청한다.

- 같은 action ID와 같은 명령을 다시 호출하면 기존 완료 영수증을 반환하고 재실행하지 않는다.
- 같은 action ID에 다른 명령이나 scope를 넣으면 거절한다.
- 실행 결과가 미확인인 action은 자동으로 재실행하지 않는다.
- action ID는 실제 작업 단위를 식별한다. 실패 검사를 반복할 때 새 ID를 쓸 수 있지만 변경·재시도 이유를 별도 증거로 남긴다.
- scope 허용은 명령의 부작용을 판별하는 샌드박스가 아니다. 외부 쓰기·커밋·배포 권한은 기존 작업 지시에서 확인한다.

## 5. 체크포인트와 새 프로세스 재개

    python3 "$ORDER_KIT/order_harness.py" --state-dir "$ORDER_STATE" checkpoint \
      --status UNIT_VERIFIED \
      --next "다음 독립 수락 사례를 확인" \
      --evidence /path/to/order/result.json

    python3 "$ORDER_KIT/order_harness.py" --state-dir "$ORDER_STATE" resume

resume는 새 프로세스에서 다음을 확인한다.

1. 현재 파일과 append-only 저널의 checksum·순서.
2. 실제 HEAD·branch, 미커밋 tracked/untracked 파일의 변경 fingerprint.
3. 명시한 증거 파일의 SHA256.
4. 기존 명령의 wrapper/child 프로세스 생존과 시작 식별자.
5. 승인·보류·다음 행동·선택 원문 버전.

소스 fingerprint는 상태 디렉터리와 비밀 이름 파일을 제외한 변경 파일을 대상으로 하며 50 MB 상한이 있다. 상한 초과·읽기 실패는 worktree_fingerprint_complete=false로 남긴다. 환경 변수·서비스 설정 전체를 동일하다고 보장하지 않는다.

| 출력 | 의미·다음 행동 |
|---|---|
| RUNNING / POSSIBLY_RUNNING | 기존 wrapper가 실행 중이거나 신원 확인이 제한됨. 중복 실행 금지 |
| ORPHANED_CHILD_RUNNING | wrapper가 사라졌지만 기록한 child는 아직 실행 중. 먼저 관찰 |
| UNKNOWN_RECOVERY_REQUIRED | 완료 영수증이 없음. 실제 파일·프로세스·외부 결과를 확인 |
| VALID_JOURNAL_AVAILABLE | current 파일 손상/미갱신, 온전한 저널로 복구 가능. 검토 후 repair-current |
| JOURNAL_CORRUPT | 저널 자체가 손상됨. 자동 초기화·묵시적 되감기 없음 |

current 파일의 복구는 다음처럼 별도로 수행한다.

    python3 "$ORDER_KIT/order_harness.py" --state-dir "$ORDER_STATE" repair-current

실제 결과를 확인한 미완료 명령만 다음과 같이 조정한다. 이 명령은 과거 실행을 재생하지 않는다.

    python3 "$ORDER_KIT/order_harness.py" --state-dir "$ORDER_STATE" reconcile \
      --action-id C55-ADDRESS-UNIT-001 --outcome succeeded \
      --external-state-checked \
      --note "실제 산출물과 종료된 프로세스를 확인한 근거" \
      --evidence /path/to/order/observed-result.json

ready_to_continue_without_reconciliation은 기록된 체크포인트 항목의 비교 결과다. 프로젝트의 모든 승인·기능 검증을 통과했다는 뜻이 아니다. scope 권한과 최신 지시를 계속 확인한다.

## 6. 작업 공간 소실에 대비한 내보내기·복원

    python3 "$ORDER_KIT/order_harness.py" --state-dir "$ORDER_STATE" export \
      --output /path/outside/state/checkpoint.zip \
      --include-action C55-ADDRESS-UNIT-001 \
      --evidence /path/to/order/observed-result.json \
      --include-config

기본 내보내기는 current와 저널이다. 명시한 action의 영수증·로그, 증거, 선택한 라우팅 설정만 추가한다. 작업 트리 전체·환경 변수·검색 DB를 자동 수집하지 않는다. 수정 중 소스나 patch를 복원해야 하면 해당 파일을 명시적 증거로 선택하거나 기존 Git checkpoint 절차로 보존한다.

**로컬 ZIP만으로 임시 작업 공간 소실을 대비할 수는 없다.** 실행방은 작업 단위 완료 시 이 ZIP과 SHA256을 승인된 Drive/Git 등 지속 보관 위치에 저장하고 다시 읽어 확인해야 한다. 이 host 연결은 아직 구현·검증되지 않았다.

새 작업 공간에서는 승인된 실제 repo와 함께 복원한다.

    python3 "$ORDER_KIT/order_harness.py" --state-dir /new/path/.order-harness restore \
      --archive /downloaded/checkpoint.zip --repo /new/path/order
    python3 "$ORDER_KIT/order_harness.py" --state-dir /new/path/.order-harness resume

복원은 ZIP 경로·크기·checksum을 확인하고 **상태만** 새 디렉터리에 설치한다. 기존 상태를 덮어쓰지 않고, 증거를 제품 작업 트리에 적용하거나 명령을 실행하지 않는다. 보관된 증거 사본이 있어도 실제 작업 트리의 파일이 없으면 MISSING으로 표시한다.

## 7. 아스트라 연결 범위와 검증

AGENTS.integration.md의 짧은 연결 절과 INTEGRATION_CHECKLIST.md를 기존 지침에 합친다. 자동 lifecycle hook은 호스트의 실제 지원과 소유권을 확인한 뒤 최소 범위로 연결한다. Python 모듈만 복사했다는 이유로 자동 훅·업로드·제품 적용이 완료됐다고 기록하지 않는다.

    python3 -m unittest discover -s /path/to/order_harness_kit/tests -v

이 시험은 제품 저장소를 사용하지 않고 독립된 로컬 fixture를 생성한다. 마지막 결과와 범위는 verification/ACCEPTANCE_REPORT.json 및 실제 로그에 있다. Linux에서 확인했으며 macOS·Windows의 호스트 동작은 별도 확인이 필요하다.

주간 사용량, 대화 길이, 모델 문맥은 서로 다른 제약이다. 이 킷은 반복 출력·중복 실행·재조사 비용을 줄이기 위한 도구이며, 계정 할당량을 늘리거나 한도 소진 후 실행을 보장하지 않는다.
