# SDD 개발 기반 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 다중 에이전트 실행을 선택하면 superpowers:subagent-driven-development를 적용한다.

**Goal:** DDD를 반영한 기획·설계를 SDD 개발·검증으로 연결하고, 사람과 AI가 바뀌어도 공통 기준을 유지하는 재사용 기반의 첫 버전을 제작한다.

**Architecture:** 솔루션 제작 자료와 배포할 구성을 분리한다. 새 프로젝트에 전달한 공통 파일, 프로젝트가 작성한 내용, AI 도구가 생성한 파일의 소유권을 구분한다. OpenSpec의 기본 기능 개발 절차를 사용하고 명세·설계 검토와 완료 검토 스킬만 추가한다.

**Tech Stack:** Markdown, OpenSpec, 관리용 Node.js ES modules·내장 테스트 러너. 제품 언어·프레임워크·배포 기술은 지정하지 않는다. 내보내기 도구의 ZIP 생성에만 fflate를 사용한다.

**Spec:** [요구사항 v0.2](requirements.md), [구조 설계 v0.2](design.md).

- 계획 상태: 제작 전 — 모든 작업 미실행
- 작성일: 2026-11-18
- 성격: 솔루션 제작용 작업 계획. 파생 프로젝트의 기본 입력에서 제외한다.
- 현황: 이 채팅 환경에서 Node.js v24.14.0과 Git 실행을 확인했다. OpenSpec·의존성 설치나 실제 프로젝트 생성·배포 검증은 아직 하지 않았다.
- 경로 기준: 아래 파일 경로는 향후 솔루션 원본 루트를 기준으로 한다. 로컬 제작 위치는 `outputs/sdd-foundation/`을 제안하며 GitHub 저장소 이름과는 별개다.

## Global Constraints

- “특정 애플리케이션 코드나 배포 환경 없이 기반 자체를 사용할 수 있어야 한다.”
- “파생 프로젝트의 기본 문서 탐색과 AI 읽기 경로에는 제작 문서와 예시를 넣지 않는다.”
- “OpenSpec 기본 산출물과 별도의 동일 목적 문서를 중복 생성하지 않는다.”
- “개인 개발에서 형식적인 다인 승인 절차를 강제하지 않는다.”
- “공통 규칙을 다른 AI마다 복제하지 않는다.” 동일 의미의 스킬 생성 복사본은 원본·해시·도구 연결 정보를 기록한다.
- OpenSpec 생성 스킬이나 기존 프로젝트 문서를 폴더 단위로 덮어쓰지 않는다. 업데이트 첫 버전은 비교 보고와 수동 반영 안내만 제공한다.
- 생성 파일, 문서 검사 통과, AI 세션 동작, 애플리케이션 테스트, 배포 성공은 각각 구분한다.
- 문서 본문과 설명은 한국어를 기본으로 한다. 도구가 요구하는 파일명·명세 구문·메타데이터는 보존한다.
- 관리 도구는 Node.js 22.20.0 이상으로 시작하되, 실제 검증한 Node·OS 조합을 공개한다. 제품 프로젝트에 Node.js 애플리케이션을 강제하지 않는다.
- OpenSpec 초기 호환성 검증 대상으로 `2.1.0`을 선택한다. ZIP 라이브러리는 `fflate@0.8.3`을 사용하고 lockfile로 고정한다. 설치 시 레지스트리의 실제 배포 여부와 지원 환경을 확인하며, 미확인 버전으로 성공을 주장하지 않는다.
- 제작 단계에서 스킬 작성은 writing-skills/skill-creator 지침을 확인한다. 실행 코드의 테스트는 동작을 입증하는 범위로 작성하며, 단순 설명문을 그대로 재확인하는 테스트는 만들지 않는다.
- 작업별 변경은 해당 검증 후 명확한 단위로 commit한다. GitHub 이름·소유자·공개 범위·라이선스는 외부 저장소 생성·공개 전에 결정한다. 로컬 제작은 그 결정과 독립적으로 진행할 수 있다.

## Review Focus

1. 기존 파일·심볼릭 링크·프로젝트 경계 밖 경로가 입력되면 내보내기·연결 도구가 기존 내용을 건드리지 않고 거절하는가 — Task 3·4.
2. Windows의 공백·한글 경로와 숨김 폴더가 ZIP·내부 문서 링크·스킬 복사에 정상 반영되는가 — Task 3·4·5.
3. 사람이 수정한 연결 파일·관리 파일과 OpenSpec 소유 파일을 구분해 재연결·업데이트에서 보존하는가 — Task 4·6.
4. 빈 명세·잘못된 참조·모두 미검증인 결과를 도구나 스킬이 완료로 오인하지 않는가 — Task 2·5·7.
5. 도구별 파일 생성 검증을 실제 AI 세션 호환성 검증으로 확대해 보고하지 않는가 — Task 4·7.

---

## 1. 파일과 인터페이스의 공통 계약

### 1.1 원본 구성

| 경로 | 책임 |
|---|---|
| `README.md`, `AGENTS.md`, `maintainer/` | 솔루션 자체의 소개·요구사항·설계·제작 기록 |
| `distribution/managed/` | 새 프로젝트의 `.foundation/`으로 전달할 규칙·양식·스킬·검사 도구 |
| `distribution/starter/` | 최초 한 번만 생성한 뒤 프로젝트 소유가 되는 문서의 `.template` 원본 |
| `integrations/` | AI별 연결 경로·양식·지원 상태 |
| `tools/` | 내보내기·연결·버전 비교 실행 도구 |
| `examples/` | 실제 프로젝트 명세로 오인하지 않도록 분리한 참고 사례 |
| `tests/` | 생성·보존·경로·검사·업데이트 동작 검증 |
| `releases/` | 버전별 제공 목록·변경 영향·적용 안내 |

배포 목록에 없는 원본 파일은 전달하지 않는다. `maintainer/`, `examples/`, 원본 개발용 `AGENTS.md`, 원본의 OpenSpec 기록·도구 설정은 기본 배포 대상이 아니다.

### 1.2 초기 생성 문서

초기에는 `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `docs/README.md`, `docs/project/profile.md`, `docs/product/brief.md`, `docs/domain/glossary.md`를 생성한다. 문서 이름·링크는 다음 작업에서도 동일하게 사용한다. 실제 값은 프로젝트가 채우며 기술 미정은 `미정`으로 표시한다.

도메인 규칙·경계·상태, ADR, 운영 안내, 검증 기록은 `.foundation/templates/`의 양식을 사용해 필요할 때 생성한다. API 계약·애플리케이션 폴더는 생성하지 않는다.

### 1.3 도구 API와 반환값

모든 함수는 async이며 오류 시 명시적인 code를 가진 Error를 던진다. 파일 경로는 내부 처리에서 절대 경로를 사용하고 manifest에는 프로젝트 상대 POSIX 경로를 저장한다. 절대 경로·`..`·드라이브 경로·심볼릭 링크를 배포 경로로 허용하지 않는다.

```js
// tools/export-project.mjs
exportProject({ sourceRoot, targetDir, version, projectName })
  // -> { projectDir, lock }
// tools/package-release.mjs
packageRelease({ projectDir, zipPath })
  // -> { zipPath, sha256, fileCount }
// tools/connect-tools.mjs
connectTools({ projectRoot, tools })
  // tools: ['codex' | 'claude' | 'cursor']; -> { created, unchanged, connections }
// distribution/managed/checks/check-project.mjs
checkProject({ projectRoot, changeName })
  // changeName 생략: 시작 문서·링크 검사. 지정: 해당 변경의 명세도 검사
  // -> { status: 'pass' | 'fail', findings: [{ code, path, message }] }
// tools/compare-update.mjs
compareUpdate({ projectRoot, candidateRoot })
  // candidateRoot: 신규 버전 내보내기 결과; -> { fromVersion, toVersion, added,
  // changed, removed, conflicts, connectionRefresh, manualActions }
// tools/record-baseline.mjs
recordBaseline({ projectRoot, candidateRoot })
  // -> { version, lockPath }; 신규 관리 파일과의 일치를 확인하고 lock만 갱신
```

위 주석의 뜻: `changeName`을 생략하면 시작 문서·링크를 검사하고, 지정하면 해당 변경의 명세도 검사한다. `candidateRoot`는 신규 버전 내보내기 폴더다. `recordBaseline`은 실제 설치된 관리 파일이 신규 버전과 일치할 때 버전 기록만 갱신한다. 제품 명령이나 테스트를 대신 실행·승인하지 않는다.

CLI는 각각 `node tools/<도구>.mjs`로 실행하고 `--help`를 제공한다. 성공 0, 검사 발견·충돌 1, 잘못된 입력·환경 오류 2를 사용한다. JSON 모드를 제공해 CI에서 발견 사항을 읽을 수 있게 한다. 사용자 설정에 있는 명령 문자열은 이 도구들이 자동 실행하지 않는다.

### 1.4 버전·파일 기록

`foundation.lock.json`의 첫 스키마는 다음 구조로 한다. 파일 해시는 원본 바이트의 SHA-256이며 생성 순서·시각에 의존하지 않는다.

```json
{
  "schemaVersion": 1,
  "foundationVersion": "0.1.0",
  "managedFiles": { ".foundation/guide.md": "<sha256>" },
  "connections": {
    "tools": [],
    "files": {}
  },
  "compatibility": { "openspec": "2.1.0" }
}
```

연결 생성 후 `connections.files`에 상대 경로별 `{ source, sha256 }`를 기록한다. root AGENTS 및 제품 문서는 초기 생성 후 업데이트 관리 목록에 넣지 않는다. 도구가 생성한 OpenSpec 스킬도 이 기반의 관리 목록에 넣지 않는다. 설치된 도구 캐시·`node_modules`·로그는 버전 해시 대상에서 제외한다.

## Task 1: 기본 문서와 파일 소유 경계

**Files**
- Create: `README.md`, `AGENTS.md`, `maintainer/requirements.md`, `maintainer/design.md`, `maintainer/implementation-plan.md`.
- Create: `distribution/managed/guide.md`, `distribution/managed/workflow.md`.
- Create: `distribution/starter/README.md.template`, `distribution/starter/AGENTS.md.template`, `distribution/starter/CONTRIBUTING.md.template`.
- Create: `distribution/starter/docs/README.md.template`, `distribution/starter/docs/project/profile.md.template`, `distribution/starter/docs/product/brief.md.template`, `distribution/starter/docs/domain/glossary.md.template`.

**Interfaces**
- Consumes: 요구사항·설계 v0.2와 이 계획의 초기 파일 목록.
- Produces: 내보낼 텍스트 원본, 프로젝트 이름 치환값 `{{PROJECT_NAME}}`, 이후 검사·스킬이 참조할 고정 문서 경로.

- [ ] 기획·설계에서는 DDD를 반영하고 개발·검증에서는 명세를 기준으로 진행한다는 사용자 관점의 한 가지 흐름을 설명한다.
- [ ] 루트 원본 지침은 솔루션 개발만 안내하고, starter 지침은 `.foundation/guide.md`와 해당 프로젝트 문서로 연결한다. 제작 문서를 maintainer 경로로 옮길 때 요구사항·설계·계획 사이 상대 링크도 새 파일명에 맞춰 변경한다.
- [ ] profile에 기술 선택·코드 규칙·검토 방식·실행/테스트/배포 명령·미정 사항을 기록할 자리를 제공한다. 실제 명령은 임의로 채우지 않는다.
- [ ] 사람이 읽으며 빈 프로젝트 시작 순서를 따라가고, 중복 명세·불필요한 역할 강제가 없는지 확인한다. 설명문만을 위한 자동 테스트는 작성하지 않는다.
- [ ] Task 1 변경을 검토하고 commit한다.

**완료 결과:** 기획부터 첫 기능까지 어떤 문서를 언제 작성할지 대화 이력 없이 이해할 수 있다. BASE-01·02·03·11·15.

## Task 2: 양식·체크리스트와 검토 스킬 두 개

**Files**
- Create under `distribution/managed/templates/`: `domain-rules.md`, `context-map.md`, `state-model.md`, `adr.md`, `runbook.md`, `verification.md`.
- Create under `distribution/managed/checklists/`: `spec-design.md`, `completion.md`.
- Create: `distribution/managed/skills/foundation-spec-review/SKILL.md.template`, `distribution/managed/skills/foundation-completion-review/SKILL.md.template`.
- Create: `maintainer/verification/skill-evaluation.md`.

**Interfaces**
- Consumes: Task 1 문서 경로·소유 규칙.
- Produces: 스킬 이름 `foundation-spec-review`, `foundation-completion-review`; 호출 가능한 SKILL.md는 도구 연결 시 생성한다. `.template` 원본은 그대로 자동 로드되는 스킬로 취급하지 않는다.

- [ ] 각 양식에 작성 목적·필수/조건부 항목·관련 원본 링크를 제공한다. 예시 값은 빈 양식의 실제 정책으로 넣지 않는다.
- [ ] 시나리오 인수 조건 ID는 `AC-001` 형식을 사용하고 변경 안에서 유일하게 한다. 다른 변경은 변경 이름과 함께 참조한다. OpenSpec의 `Requirement`·`Scenario` 구문은 유지하며 시나리오 제목에 `[AC-001]`을 붙인다.
- [ ] 작업 목록은 `(AC: AC-001)`처럼 연결한다. 명세 외 환경 작업은 `(SETUP: 사유)`를 사용한다. 검증 기록은 `AC ID / 충족·미충족·미검증 / 증거 / 남은 문제`로 정한다.
- [ ] 명세 검토 스킬은 누락·모호함·DDD 규칙 불일치·구현 전 미정 사항을 근거 위치와 함께 반환한다. 산출물은 검토 결과이며 자동 승인으로 표시하지 않는다.
- [ ] 완료 검토 스킬은 인수 조건별 증거를 대조하고, 미검증·실패 항목이 있으면 전체 완료라고 판정하지 않는다. 문서 검사 성공만으로 실제 테스트 성공을 추정하지 않는다.
- [ ] 완전한 사례와 권한 규칙 누락·모든 테스트 미실행 사례로 스킬의 기대 출력을 정리한다. 실제 AI 실행 평가와 단순 텍스트 검토의 결과를 구분해 기록한다.
- [ ] Task 2 변경을 검토하고 commit한다.

**완료 결과:** 동일한 입력에 대해 무엇을 검토하고 어떤 형식으로 결과를 제출할지 고정된다. BASE-04·05·06·07·08·09.

## Task 3: 필요한 구성만 내보내기와 ZIP 생성

**Files**
- Create: `package.json`, `package-lock.json`, `.gitignore`.
- Create: `tools/export-project.mjs`, `tools/package-release.mjs`, `tools/lib/paths.mjs`, `tools/lib/lock.mjs`.
- Create: `releases/distribution-map.json`, `tests/export.test.mjs`, `tests/package-release.test.mjs`.

**Interfaces**
- Consumes: Task 1·2 원본, 공통 API·lock 스키마.
- Produces: 필요한 구성만 담긴 프로젝트 폴더·ZIP. 생성 루트의 제품 package.json은 만들지 않는다.

- [ ] `exports_only_declared_assets`, `preserves_nonempty_target`, `rejects_path_escape_and_symlink`, `zip_keeps_hidden_and_korean_paths` 테스트를 작성한다. 제작 문서·예시·Git 이력이 ZIP에 없고 `.foundation/`은 존재하는지 검증한다.
- [ ] `node --test tests/export.test.mjs tests/package-release.test.mjs`가 미구현 동작 때문에 실패하는지 확인한다.
- [ ] source package에 관리용 의존성을 고정하고 공통 API를 구현한다. 배포 매핑은 source·target·mode(starter/managed) 목록으로 정의하며 저장소 전체 탐색 복사는 하지 않는다.
- [ ] target은 미존재 또는 빈 폴더만 허용한다. 모든 입력 검증 후 임시 staging에서 생성하고, 실패하면 부분 생성물을 완성 결과로 반환하지 않는다. ZIP 경로도 기존 파일을 덮어쓰지 않는다.
- [ ] starter의 `.template`을 제거하고 `{{PROJECT_NAME}}`만 지정된 텍스트에서 치환한다. SKILL.md.template는 이 단계에서 활성 스킬 경로로 바꾸지 않는다.
- [ ] 지정 테스트를 다시 실행해 통과를 확인하고 commit한다.

**완료 결과:** 제품 코드·제작 자료가 섞이지 않는 시작 파일과 재현 가능한 파일 목록·해시를 제공한다. AC-01·10.

## Task 4: AI별 진입·스킬 연결과 보존

**Files**
- Create: `integrations/tools.json`, `integrations/claude/CLAUDE.md.template`, `integrations/README.md`.
- Create: `tools/connect-tools.mjs`, `tests/connect-tools.test.mjs`.

**Interfaces**
- Consumes: 내보낸 `.foundation/skills/*/SKILL.md.template`, 기존 lock.
- Produces: 선택 도구의 스킬 생성본, 필요한 진입 파일, `connections` 기록. 무관한 파일은 수정하지 않는다.

- [ ] `shared_skills_for_codex_and_cursor`, `claude_adds_import_and_skill_copies`, `rerun_is_idempotent`, `modified_connection_aborts_without_writes`, `preserves_openspec_skills`, `rejects_unsupported_tool`을 테스트한다.
- [ ] `node --test tests/connect-tools.test.mjs`로 미구현 실패를 확인한다.
- [ ] 검증 대상으로 삼는 공식 문서의 경로를 확인해 도구별 매핑을 고정한다. 초기 연결안은 Codex·Cursor에 `.agents/skills/foundation-*/SKILL.md`, Claude에 추가로 `.claude/skills/foundation-*/SKILL.md`와 `CLAUDE.md`의 `@AGENTS.md`를 사용한다.
- [ ] 플랫폼별 링크 권한 차이를 줄이기 위해 첫 버전은 생성 복사본을 사용한다. 공통 원본의 상대 링크는 생성 위치에서 동일 원본을 가리키도록 렌더링하고, 제품 규칙 본문을 복제하지 않는다.
- [ ] 모든 쓰기 대상을 사전 검사한다. 미소유 기존 파일, 지역 수정, 심볼릭 링크가 있으면 해당 실행 전체를 중단한다. 기존 파일이 lock의 이전 생성 해시와 일치하면 새 공통 원본으로 갱신할 수 있다. 기존 OpenSpec 스킬·사용자 규칙을 유지한다.
- [ ] 실제 AI 세션을 실행하지 않은 도구는 `파일 생성 검증 완료 / 실제 세션 미검증`으로 기록한다. 파일 생성만으로 지원 완료 표시를 하지 않는다.
- [ ] 지정 테스트를 실행하고 commit한다.

**완료 결과:** 같은 기준·스킬을 도구가 인식하는 방식으로 제공하고 지역 수정을 보존한다. BASE-09·10, AC-03·04.

## Task 5: 문서·명세 연결 검사

**Files**
- Create under `distribution/managed/checks/`: `check-project.mjs`, `cli.mjs`, `markdown.mjs`.
- Create: `tests/check-project.test.mjs`, `tests/fixtures/checks/`.

**Interfaces**
- Consumes: 프로젝트 문서, Task 2의 AC 표기, Task 3의 파일 소유 정보.
- Produces: 공통 `checkProject` 결과와 Node 단독 실행 가능한 배포용 CLI. 제품 npm 프로젝트를 요구하지 않는다.

- [ ] `valid_starter_passes`, `empty_required_section_fails`, `missing_internal_file_fails`, `korean_encoded_path_resolves`, `duplicate_ac_fails`, `unknown_task_ac_fails`, `ignores_code_fence_samples`를 테스트한다.
- [ ] `node --test tests/check-project.test.mjs`가 실패하는지 확인한다.
- [ ] 검사 대상과 링크 문법을 제한해 구현한다. 첫 버전은 코드 블록·코드 span 밖의 inline Markdown 파일 링크만 검사하며 URL·앵커·reference-style 링크는 검사 범위 밖으로 명시한다. 프로젝트 밖 링크는 외부 의존 참조로 보고하고 자동으로 읽지 않는다.
- [ ] starter 모드는 필수 파일·기본 항목과 해당 파일의 링크를 검사한다. 미정 값을 허용하되 채워진 실행 환경으로 표시하지 않는다. change 모드는 `--change <이름>`으로 해당 proposal·specs·tasks의 누락·중복 AC·끊긴 참조만 검사한다.
- [ ] 설계 필수 입력은 `proposal.md`의 목적·포함 범위·제외 범위·행위자/권한·미정 사항과 specs의 정상/실패 시나리오다. 정확한 heading 대응은 fixture와 설정에 명시한다. OpenSpec 자체 문법 검사는 다음 작업에서 공식 CLI로 별도 수행한다.
- [ ] 일반 문서 양식의 길이나 코드 품질을 판정하지 않으며 검사를 통과했다고 업무 규칙이 옳다고 주장하지 않는다.
- [ ] 지정 테스트를 실행하고 commit한다.

**완료 결과:** 실제 결함인 항목 누락·잘못된 파일 링크·인수 조건 연결 오류를 검출한다. AC-06.

## Task 6: 업데이트 비교와 버전 기록

**Files**
- Create: `tools/compare-update.mjs`, `tools/record-baseline.mjs`, `tests/compare-update.test.mjs`, `tests/record-baseline.test.mjs`.
- Create: `distribution/managed/updating.md`, `releases/0.1.0.md`, `CHANGELOG.md`.

**Interfaces**
- Consumes: 프로젝트 lock, 실제 관리 파일, 신규 버전 내보내기 결과.
- Produces: 읽기 전용 차이 보고와 수동 적용 절차. 자동 파일 병합·삭제·제품 테스트 실행은 제공하지 않는다.

- [ ] `reports_added_changed_removed`, `local_edit_is_conflict`, `local_delete_is_conflict`, `ignores_project_content`, `marks_connection_refresh`, `rejects_unknown_schema_and_corrupt_manifest`, `baseline_requires_installed_files_match`를 테스트한다. 비교 전후 전체 프로젝트 파일 해시가 동일한지도 확인한다.
- [ ] 해당 두 테스트 파일을 실행해 미구현 실패를 확인한다.
- [ ] 이전 기준과 실제 파일의 차이는 conflict로, 이전·신규 배포물 차이는 added/changed/removed로 구분한다. 현재 파일과 신규 배포물이 같은 경우도 결정적으로 보고한다.
- [ ] 직접 수정한 연결 파일을 덮어쓰지 않도록 `connectionRefresh`에 경로·이유를 보고한다. lock에 없는 파일을 삭제 대상으로 추정하지 않는다.
- [ ] 수동 적용 후 `recordBaseline`은 신규 관리 파일의 일치와 기존 연결 상태의 정합성을 확인한다. 필요한 연결 갱신이 남아 있으면 버전을 확정하지 않는다. 검증 실행 결과는 별도로 기록하도록 안내한다.
- [ ] 별도 변경 단위 적용·검증·버전 기록·Git 변경 되돌리기로 복구하는 안내를 작성한다. 새 starter 양식은 기존 제품 문서에 덮어쓰지 않고 수동 비교 대상으로 안내한다.
- [ ] 지정 테스트를 실행하고 commit한다.

**완료 결과:** 원본 개선을 확인하고 프로젝트 내용을 보존하며 도입할 수 있다. AC-08.

## Task 7: OpenSpec 연결·작성 예시·첫 사용 검증

**Files**
- Create: `distribution/managed/openspec-rules.yaml`, `distribution/managed/getting-started.md`.
- Create: `examples/reservation-cancellation/README.md`, `docs/`, `openspec/`와 `verification.md`.
- Create: `examples/profiles/java-vm.md`, `python-container.md`.
- Create: `tests/journey.test.mjs`, `tests/openspec-compatibility.test.mjs`, `maintainer/verification/first-release.md`.
- Modify: `README.md`, `distribution/managed/workflow.md`, `integrations/README.md`, `package.json`, `package-lock.json`.

**Interfaces**
- Consumes: Task 1~6 결과, OpenSpec 2.1.0의 spec-driven 절차.
- Produces: 배포물에서 첫 기능 작성·검토·기록 마무리까지 따라가는 사용 안내, 검증한 조합·미검증 항목을 밝힌 결과.

- [ ] `rules_reach_expected_artifacts`, `native_spec_format_accepts_ac_heading`, `archive_updates_current_specs`, `exported_project_excludes_example`를 테스트한다. 초기 변경이 비어 있거나 CLI가 미설치면 호환성 PASS로 처리하지 않는다.
- [ ] 실패 원인을 확인한 뒤 설정·예시를 작성한다. YAML 조각은 OpenSpec 기본 템플릿을 복제하지 않고 `context`, `rules`, 필요시 `operations`에 짧게 원본 경로·필수 결과를 연결한다.
- [ ] source package의 개발용 OpenSpec 버전을 고정하고 신규 프로젝트에서 안내된 고정 버전 CLI를 실행하는 방법을 문서화한다. 제품 루트 package.json이나 전역 설치를 요구하지 않는다. 최초 도구 설치의 네트워크 요구도 명시한다.
- [ ] 기존 `openspec/config.yaml`은 자동 병합하지 않고 필요한 규칙을 비교해 반영하게 한다. verify에 artifact rules가 자동 주입된다고 가정하지 말고 공통 완료 검토 스킬을 별도로 연결한다.
- [ ] 예약 취소 예시는 가상 서비스임을 명시하고 본인 권한·취소 불가 상태·중복 요청·미검증 결과를 다룬다. 같은 업무 규칙·기능·기술 결정의 원문을 여러 파일에 복사하지 않는다. 구현·배포가 없는 예시를 실제 실행 증거처럼 작성하지 않는다.
- [ ] `node --test tests/journey.test.mjs tests/openspec-compatibility.test.mjs`를 실행한다. 실제 CLI로 예시 변경을 구조 검사하고 임시 사본에서 archive 후 현재 명세 반영을 확인한다. 실제 명령과 예상 조건은 고정 버전 `--help`로 확인해 기록한다.
- [ ] 문서 검사 통과와 별개로, 한 실제 AI 세션에서 명세·설계 검토 스킬 실행과 공통 결과 형식을 확인한다. 기능이 없는 환경에서는 미검증으로 남긴다. 다른 도구는 생성 파일 검사와 세션 실행 상태를 분리한다.
- [ ] 서로 다른 기술·배포 profile 두 예시가 공통 양식을 수정하지 않고 기술 선택을 표현하는지 검토한다. 실제 Java·Python 제품 코드를 구현하지 않는다.
- [ ] 시범 완료 기록에 AC-01~10 각각의 충족·미충족·미검증과 증거를 기재한다. 작은 기반 도구의 전체 단위 테스트를 한 번 실행하고 새 실패가 없으면 불필요하게 반복하지 않는다.
- [ ] Task 7 변경을 검토하고 commit한다.

**완료 결과:** 새 사용자가 문서만 보고 시작할 수 있고 기능 명세·DDD 설계·작업·검증을 연결할 수 있다. AC-01~10 전체.

## 2. 작업 순서와 중간 결과

```text
1. 기본 문서 → 2. 양식·검토 스킬 → 3. 내보내기
                                  ↓
                    4. AI 연결 / 5. 문서 검사
                                  ↓
                    6. 업데이트 비교 → 7. 사용 예시·검증
```

첫 중간 결과는 Task 1·2의 실제 양식과 스킬 내용이다. 전체 도구를 완성하기 전에 작성 깊이와 사용자 경험을 확인할 수 있다. 각 작업은 다음 작업이 의존할 인터페이스를 바꾸면 해당 계획·소비 작업도 함께 정정한다.

## 3. 실행·공개 범위

이 계획은 실제 파일 제작까지의 범위다. GitHub 저장소 생성은 사용자에게 이름·소유자·공개 범위·라이선스를 확인한 뒤 수행한다. 릴리스 업로드는 로컬 ZIP과 검증 기록이 준비된 뒤 진행하며, 저장소 생성만으로 공개 릴리스 완료를 주장하지 않는다.

실행 방식은 이 채팅에서 순차 제작하는 방식을 추천한다. 양식·스킬·내보내기·검사가 서로의 파일 형식에 의존하고 초기 제품 위험이 낮아, 작업마다 새 구현 에이전트를 만들기보다 같은 구현자가 맥락을 유지하는 편이 적합하다. 실제 스킬 평가와 최종 독립 검토는 검증 범위에 맞게 별도로 수행한다.

## 4. 계획 자체 점검

- 요구사항 BASE-01~15는 Task 1~7에서 다룬다. AC-01~10의 최종 증거는 Task 7에서 종합한다.
- 경로·기존 파일 보존, Windows 경로·숨김 파일, 지역 수정, 빈 명세·미검증 오인, AI 지원 범위 과장의 위험을 각 관련 작업에서 확인한다.
- 위 함수·반환값·파일명·AC 표기를 후속 작업의 공통 인터페이스로 사용한다.
- 자동 검사는 구조 일부만, 스킬은 검토 절차만, 실제 코드·도구 동작은 실행 검증으로 확인한다.
- 작업 체크박스는 모두 미실행 상태로 남긴다. 이 계획 문서 작성은 위 구현·테스트를 수행한 증거가 아니다.

## 참고 근거

- [OpenSpec 프로젝트 설정의 주입 범위](https://openspec.dev/docs/project-config)
- [OpenSpec CLI의 검사·archive 등 명령](https://openspec.dev/docs/cli)
- [OpenSpec의 도구별 스킬 연결 경로](https://openspec.dev/docs/supported-tools)
- [fflate package.json의 버전·라이선스](https://github.com/101arrowz/fflate/blob/master/package.json)

도구 동작·기준 버전 확인을 위한 자료이며, 이 계획의 추가 스킬·내보내기·업데이트 설계가 해당 도구의 공식 표준이라는 뜻은 아니다.
