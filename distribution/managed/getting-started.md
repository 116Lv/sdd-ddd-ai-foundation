# 첫 변경을 여는 방법

프로젝트 루트에서 시작한다. [시작 안내](guide.md)의 순서로 제품 개요·용어·프로젝트 설정을 작성하고, 첫 출시 범위에서 한 가지 사용자 행동을 고른다. 아래 `first-feature`는 자신이 고른 변경 이름으로 바꾼다.

## 1. OpenSpec 준비

관리 작업에는 Node.js 22.20.0 이상과 npm이 필요하다. 최초 실행은 npm 레지스트리 접근과 다운로드가 필요하다. 아래 명령은 제품 프로젝트에 패키지를 추가하거나 전역에 설치할 필요 없이 npm 캐시에서 고정 버전을 실행한다. Windows PowerShell에서 npm 스크립트 실행이 제한된 경우 `npm.cmd`를 사용한다.

```sh
npm exec --yes --ignore-scripts --package=@fission-ai/openspec@2.1.0 -- openspec --version
npm exec --yes --ignore-scripts --package=@fission-ai/openspec@2.1.0 -- openspec init --tools none --scope project
```

버전 출력은 `2.1.0`이다. 초기화는 새 프로젝트에서 한 번 실행한다. 이미 초기화한 프로젝트는 기존 설정과 변경을 확인하고 다음 단계로 간다. `--tools none`은 CLI로 작성할 때의 선택이다. OpenSpec 자체의 도구 통합이 필요하면 지원 ID를 `init --help`에서 확인한다.

## 2. 프로젝트 설정과 검토 도구 연결

[OpenSpec 규칙](openspec-rules.yaml)을 `openspec/config.yaml`과 비교한다. 초기화가 만든 기본 설정이라면 `schema: spec-driven`을 확인하고 조각의 `context`와 네 종류의 `rules`를 반영한다. 기존 설정에는 프로젝트 맥락과 항목별 규칙을 유지하며 필요한 문장만 추가한다. 이미 있는 YAML 키 안에 값을 합쳐 중복 키를 피한다. 다른 스키마를 쓰는 프로젝트는 해당 스키마의 산출물 이름부터 비교한다.

AI를 쓴다면 선택한 도구를 연결한다. Codex는 `--tool codex`, Claude Code는 `--tool claude`, Cursor는 `--tool cursor`를 사용한다. 여러 개를 선택하면 옵션을 반복한다.

```sh
node .foundation/tools/connect-tools.mjs --tool codex
```

## 3. 제안에서 작업 목록까지

```sh
npm exec --yes --ignore-scripts --package=@fission-ai/openspec@2.1.0 -- openspec new change first-feature
npm exec --yes --ignore-scripts --package=@fission-ai/openspec@2.1.0 -- openspec instructions proposal --change first-feature --json
```

`instructions`는 파일에 쓸 템플릿·규칙·출력 경로를 보여 준다. 안내에 따라 `proposal.md`를 작성한다. 같은 명령에서 `proposal`을 `specs`, `design`, `tasks`로 바꾸어 각 산출물을 작성한다. JSON의 `context`와 `rules`에서 프로젝트별 규칙이 반영됐는지 확인한다. [기능 변경 절차](workflow.md)의 ID 표기로 ADDED·MODIFIED의 각 시나리오와 작업을 연결한다. RENAMED·REMOVED의 시나리오 없는 작업과 변경별 `skip_specs: true`로 명세가 없는 작업은 `(CHANGE: first-feature)`에 실제 변경 이름을 넣는다. `(SETUP: 사유)`는 환경 준비에 사용한다.

## 4. 검토, 실행, 기록

```sh
node .foundation/checks/cli.mjs
node .foundation/checks/cli.mjs --change first-feature --json
npm exec --yes --ignore-scripts --package=@fission-ai/openspec@2.1.0 -- openspec validate first-feature --strict --json
```

구조 확인 후 구현 전에 AI에 `foundation-spec-review로 first-feature의 명세와 설계를 검토해 줘`라고 요청하거나 [명세·설계 체크리스트](checklists/spec-design.md)로 자체 검토한다. 구현을 막는 미정 사항은 명세와 작업에 반영한다.

[프로젝트 설정](../docs/project/profile.md)에서 정한 방법으로 구현·테스트하고 PR 또는 변경 폴더의 `verification.md`에 AC별 실제 결과와 미검증 범위를 적는다. 시나리오가 없는 변경은 같은 표에 AC `해당 없음 (변경 이름)`을 적고 의도, 실제 차이, 실행한 확인의 결과를 대조한다. 필요한 증거가 없으면 완료를 보류한다. [검증 기록 양식](templates/verification.md)을 사용할 수 있다. 완료 시 `foundation-completion-review로 first-feature의 AC와 실행 증거를 대조해 줘`라고 요청하거나 [완료 체크리스트](checklists/completion.md)를 직접 적용한다. OpenSpec 산출물별 규칙과 별개의 검토 단계다.

## 5. 현재 명세와 인계

구현·검증이 완료된 변경만 다음 명령으로 정리한다. 확인 질문과 명세 갱신 요약을 읽고 진행한다.

```sh
npm exec --yes --ignore-scripts --package=@fission-ai/openspec@2.1.0 -- openspec archive first-feature
```

`openspec/specs/<기능>/spec.md`에서 현재 동작을 확인하고 `openspec/changes/archive/`의 변경 기록과 함께 검토한다. 인계 시 변경 이름, 브랜치나 커밋, 검증 기록과 남은 작업을 전달한다. 배포를 했다면 운영 증거도 따로 연결한다.
