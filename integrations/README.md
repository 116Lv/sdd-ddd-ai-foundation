# AI 도구 연결

내보낸 프로젝트나 ZIP을 푼 폴더의 루트에서 Node.js 22.20.0 이상으로 실행한다. 필요한 도구마다 `--tool`을 한 번씩 지정한다.

```sh
node .foundation/tools/connect-tools.mjs --tool codex --tool cursor
node .foundation/tools/connect-tools.mjs --tool claude --json
```

원본 저장소에서는 `node tools/connect-tools.mjs --project-root <프로젝트 폴더> --tool codex`로 같은 도구를 실행할 수 있다. `--help`로 옵션을 확인한다.

| 도구 | 공통 지침 | 프로젝트 스킬 경로 | 확인 상태 |
| --- | --- | --- | --- |
| Codex | 루트 `AGENTS.md` | `.agents/skills/foundation-*/SKILL.md` | 파일 생성·명시 호출·발췌본 완료 검토 확인. 최신 세션의 직접 읽기 0/18, 문서 인계·자동 호출 미검증 |
| Claude Code | 루트 `CLAUDE.md`의 `@AGENTS.md` 가져오기 | `.claude/skills/foundation-*/SKILL.md` | 파일 생성 검증 완료 / 실제 세션 미검증 |
| Cursor | 루트 `AGENTS.md` | `.agents/skills/foundation-*/SKILL.md` | 파일 생성 검증 완료 / 실제 세션 미검증 |

사용자가 가상 예시와 공통 검토 규칙의 전송을 승인한 뒤 Codex API 세션은 종료 코드 0으로 응답했다. 하위 읽기 명령 7건이 거부됐고, 두 검토 표의 머리글만 확인했다. 완료 행의 상태 ‘판정 불가’는 허용한 세 상태를 벗어났으며 네 AC를 개별 판정한 결과는 없다. 전체 완료는 보류됐다. [네이티브 세션 기록](../maintainer/verification/native-session.md) · [첫 버전 검증 기록](../maintainer/verification/first-release.md)

- Codex 공식 문서의 [스킬 경로](https://learn.chatgpt.com/docs/build-skills)와 [프로젝트 지침](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- Claude Code 공식 문서의 [스킬 경로](https://code.claude.com/docs/en/skills)와 [지침 가져오기](https://code.claude.com/docs/en/memory)
- Cursor 공식 문서의 [스킬 경로](https://cursor.com/docs/skills)와 [프로젝트 지침](https://cursor.com/docs/rules)

Codex와 Cursor는 스킬 복사본을 공유한다. 복사본의 참조 경로는 프로젝트 루트 기준이다. 공통 스킬은 `.foundation/skills/`의 양식에서, Claude 진입 파일은 `.foundation/integrations/claude/CLAUDE.md.template`에서 가져온다. `foundation.lock.json`의 `connections`에는 선택한 도구와 복사본별 원본 경로·SHA-256이 기록된다. 파일 생성은 Windows의 Node.js 24.14.0에서 원본 CLI와 ZIP의 CLI로 확인했다.

기존 생성본을 갱신하려면 같은 도구로 다시 실행한다. 기록한 생성 해시가 현재 파일과 일치할 때 선택한 도구의 생성본을 갱신하며, 새 원본과 바이트가 같으면 기존 파일을 유지한다. 이후 다른 도구를 선택하면 앞서 기록한 연결에 추가된다. 소유 기록이 없는 파일, 직접 수정한 생성본 또는 연결 경로의 심볼릭 링크를 발견하면 실행을 중단하고 대상 경로를 알려 준다. 기존 `CLAUDE.md`를 사용하는 프로젝트에서는 사용자가 해당 파일에 `@AGENTS.md`를 가져오는 구성을 검토할 수 있다. 해당 파일의 수정과 스킬의 수동 배치는 프로젝트에서 관리한다.

`--json`의 `created`는 생성·갱신한 경로, `unchanged`는 기존 바이트를 유지한 경로를 반환한다. 종료 코드 0은 성공, 1은 경로·소유 충돌 또는 다른 연결 작업 진행 중, 2는 입력·환경 오류에 사용한다. 다른 연결 작업이 진행 중이면 종료 후 다시 실행한다.

## 중단된 연결 복구

ZIP을 푼 프로젝트에서는 `.foundation/updating.md`의 **중단된 연결 복구**를 따른다. [복구 절차 원본](../distribution/managed/updating.md#중단된-연결-복구)
