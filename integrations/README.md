# AI 도구 연결

내보낸 프로젝트나 ZIP을 푼 폴더의 루트에서 Node.js 22.20.0 이상으로 실행한다. 필요한 도구마다 `--tool`을 한 번씩 지정한다.

```sh
node .foundation/tools/connect-tools.mjs --tool codex --tool cursor
node .foundation/tools/connect-tools.mjs --tool claude --json
```

원본 저장소에서는 `node tools/connect-tools.mjs --project-root <프로젝트 폴더> --tool codex`로 같은 도구를 실행할 수 있다. `--help`로 옵션을 확인한다.

| 도구 | 공통 지침 | 프로젝트 스킬 경로 | 확인 상태 |
| --- | --- | --- | --- |
| Codex | 루트 `AGENTS.md` | `.agents/skills/foundation-*/SKILL.md` | 파일 생성 검증 완료 / 실제 세션 미검증 |
| Claude Code | 루트 `CLAUDE.md`의 `@AGENTS.md` 가져오기 | `.claude/skills/foundation-*/SKILL.md` | 파일 생성 검증 완료 / 실제 세션 미검증 |
| Cursor | 루트 `AGENTS.md` | `.agents/skills/foundation-*/SKILL.md` | 파일 생성 검증 완료 / 실제 세션 미검증 |

- Codex 공식 문서의 [스킬 경로](https://learn.chatgpt.com/docs/build-skills)와 [프로젝트 지침](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- Claude Code 공식 문서의 [스킬 경로](https://code.claude.com/docs/en/skills)와 [지침 가져오기](https://code.claude.com/docs/en/memory)
- Cursor 공식 문서의 [스킬 경로](https://cursor.com/docs/skills)와 [프로젝트 지침](https://cursor.com/docs/rules)

Codex와 Cursor는 스킬 복사본을 공유한다. 복사본의 참조 경로는 프로젝트 루트 기준이다. 공통 스킬은 `.foundation/skills/`의 양식에서, Claude 진입 파일은 `.foundation/integrations/claude/CLAUDE.md.template`에서 가져온다. `foundation.lock.json`의 `connections`에는 선택한 도구와 복사본별 원본 경로·SHA-256이 기록된다. 파일 생성은 Windows의 Node.js 24.14.0에서 원본 CLI와 ZIP의 CLI로 확인했다.

기존 생성본을 갱신하려면 같은 도구로 다시 실행한다. 기록한 생성 해시가 현재 파일과 일치할 때 선택한 도구의 생성본을 갱신하며, 새 원본과 바이트가 같으면 기존 파일을 유지한다. 이후 다른 도구를 선택하면 앞서 기록한 연결에 추가된다. 소유 기록이 없는 파일, 직접 수정한 생성본 또는 연결 경로의 심볼릭 링크를 발견하면 실행을 중단하고 대상 경로를 알려 준다. 기존 `CLAUDE.md`를 사용하는 프로젝트에서는 사용자가 해당 파일에 `@AGENTS.md`를 가져오는 구성을 검토할 수 있다. 해당 파일의 수정과 스킬의 수동 배치는 프로젝트에서 관리한다.

`--json`의 `created`는 생성·갱신한 경로, `unchanged`는 기존 바이트를 유지한 경로를 반환한다. 종료 코드 0은 성공, 1은 경로·소유 충돌 또는 다른 연결 작업 진행 중, 2는 입력·환경 오류에 사용한다. 다른 연결 작업이 진행 중이면 종료 후 다시 실행한다.

## 중단된 연결 복구

1. 연결 프로세스가 종료됐는지 확인하고 복구 중에는 해당 프로젝트 파일의 편집을 멈춘다. 잠금 폴더 `.foundation-connect-lock/`과 스테이징 폴더를 보존한다. 자동 복원 실패 시 CLI는 보관 경로를 표시하며 JSON 모드에서는 `recovery.directory`에 기록한다. 강제 종료로 출력이 없으면 프로젝트 루트의 `.foundation-stage-*/recovery.json`을 찾는다. 기록을 찾지 못했다면 `foundation.lock.json`과 연결 파일이 온전한지 먼저 확인한다.
2. `recovery.json`의 `target`은 프로젝트 루트 기준이다. `backup`, `staged`, `displaced`는 기록이 들어 있는 폴더 기준이고, 중단 시점에 따라 일부 파일만 존재할 수 있다. `beforeSha256`은 작업 전 해시이고 `afterSha256`은 게시하려던 바이트의 해시다. 작업 전 파일이 없었던 경로는 `beforeSha256`과 `backup`이 `null`이다. 파일마다 SHA-256을 비교하고 보관 파일과 대상 경로에 있는 지역 편집을 확인한다.
3. 기준 파일과 대상이 모두 게시 후 해시에 맞으면 연결이 완료된 상태로 볼 수 있다. 이전 상태로 복원하려면 먼저 필요한 `backup`이 작업 전 해시와 일치하는지 확인한다. 생성본부터 처리하고 `foundation.lock.json`을 마지막에 복원한다. 대상이 작업 전 해시에 맞으면 그대로 둔다. 대상이 게시 후 해시에 맞으면 덮어쓰지 않는 별도 경로로 옮긴다. 작업 전 파일이 있었던 경로는 확인한 백업을 빈 대상에 복사한다. 다른 해시나 심볼릭 링크를 발견하거나 필요한 백업이 없으면 대상과 보관본을 그대로 두고 직접 비교한다.
4. 기준 파일과 복구 결과를 확인한 뒤 빈 `.foundation-connect-lock/` 폴더를 제거한다. 연결을 다시 실행해 결과를 확인할 때까지 보관 폴더를 유지한다.
