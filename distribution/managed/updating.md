# 기반 업데이트

새 버전 ZIP을 현재 프로젝트와 별도의 폴더에 풉니다. 비교와 기록 도구는 Node.js 22.20.0 이상에서 실행합니다. 아래 예시에서 `../foundation-next`는 후보 ZIP을 푼 폴더입니다.

## 1. 차이 비교

프로젝트의 다른 변경을 먼저 커밋하고 업데이트용 Git 브랜치를 만듭니다. 프로젝트 루트에서 비교를 실행합니다.

```shell
node .foundation/tools/compare-update.mjs --candidate-root ../foundation-next
```

`added`, `changed`, `removed`는 두 버전의 관리 목록 차이입니다. `conflicts`에는 설치 기준과 달라진 파일의 경로와 이유가 표시됩니다. 충돌에서 `matchesCandidate: true`는 실제 파일 상태가 이미 후보와 같음을 뜻합니다. `connectionRefresh`는 선택한 AI 연결에서 갱신과 검토가 필요한 경로를 표시합니다.

비교는 읽기 전용입니다. `--json`을 지정하면 보고서를 JSON으로 출력합니다. 종료 코드 0은 비교 완료, 1은 충돌 발견, 2는 입력 또는 환경 오류입니다.

## 2. 관리 파일 수동 반영

1. 차이와 충돌을 검토한 뒤 승인한 관리 파일을 후보에서 경로별로 복사합니다. 새 기준의 SHA-256과 일치하도록 원본의 줄바꿈을 포함한 바이트를 보존합니다. Git 설정과 저장소 속성도 관리 파일과 생성된 연결본의 바이트를 유지해야 합니다.
2. `removed`의 파일은 기존 기준에 등록된 경로입니다. 프로젝트에서 여전히 필요한 내용은 프로젝트 소유 파일에 보존하고, 후보에서 폐기된 관리 파일은 수동으로 정리합니다. 관리 목록 외 파일은 프로젝트 소유로 취급합니다.
3. 새 ZIP의 루트 문서와 시작 양식은 참고용으로 나란히 비교합니다. 필요한 내용을 기존 `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `docs/`, `contracts/`, `openspec/`에 선별 반영합니다.

## 3. 선택한 AI 연결 갱신

관리 파일 반영 후 `foundation.lock.json`의 `connections.tools`에 기록된 모든 도구로 연결을 다시 실행합니다. 아래는 Codex와 Claude Code를 선택한 예시입니다. 연결 도구는 기존 `connections.files`의 해시로 관리 중인 복사본을 확인합니다.

```shell
node .foundation/tools/connect-tools.mjs --tool codex --tool claude
```

직접 편집한 연결 파일은 내용을 검토하고 프로젝트별 규칙을 적절한 프로젝트 소유 문서에 옮깁니다. 기존 연결을 갱신하려면 확인한 이전 생성본을 복구한 뒤 연결을 다시 실행합니다. 연결이 제거되거나 소유 경로가 바뀌어 `ownership-changed`가 발견되면, 릴리스의 마이그레이션 안내에 따라 소유권을 해결한 뒤 진행합니다. OpenSpec 연결과 다른 사용자 규칙은 기존 경로에서 관리합니다.

## 4. 검증 및 기준 기록

변경 내용을 Git diff로 검토하고 [검증 절차](workflow.md)에 따라 실제로 실행한 검사와 결과를 기록합니다. 기반 문서 검사, 공식 OpenSpec 검사, AI 세션 확인, 제품 테스트는 각자 실행 결과를 남깁니다. 그런 다음 버전을 기록합니다.

```shell
node .foundation/tools/record-baseline.mjs --candidate-root ../foundation-next
```

기록 도구는 설치된 관리 파일의 바이트, 폐기 파일의 정리, 현재 AI 연결과 기록의 일치를 확인하고 `foundation.lock.json`의 버전·관리 목록·호환성만 갱신합니다. 검증 결과는 프로젝트의 검증 기록에 남깁니다. 종료 코드 0은 기록 완료, 1은 파일 불일치 또는 연결 작업과의 경합, 2는 입력 또는 환경 오류입니다. 기록 후 `git diff`에서 버전과 관리 파일, 연결 변경을 확인하고 한 변경 단위로 커밋합니다.

## 되돌리기

커밋 전에는 Git으로 업데이트 시작 시점과 비교해 이 변경 단위의 관리 파일, 연결본, 기준 파일을 함께 복원합니다. 새로 추가한 파일은 비교 보고서와 `git status`에서 업데이트에 속하는지 확인한 뒤 정리합니다. 이미 커밋했다면 업데이트 커밋을 `git revert`로 되돌립니다.

연결 작업이 중단되어 `.foundation-connect-lock`과 `.foundation-stage-*`가 남아 있으면 실행 중인 작업이 끝났는지 먼저 확인합니다. 보관 폴더의 `recovery.json`에서 대상 경로와 전후 해시를 읽고 복구 파일을 확인합니다. 추가 편집을 별도로 보존하고 Git 또는 보관 폴더로 복구한 뒤 잠금을 정리합니다.
