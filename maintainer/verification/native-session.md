# 0.1.0 네이티브 문서 검토 추가 검증

2026-11-18 Windows에서 Codex CLI 0.169.0-alpha.11.1로 `6f7da62`의 가상 예약 사례를 대상으로 두 검토 스킬을 호출했다. **두 스킬을 명시한 세션은 응답했고, 프로젝트 파일을 직접 읽은 건수는 0/18이었다.** 최종 예시의 명세·설계 검토와 신규 작업자 인계(AC-04)는 미검증이다.

## 시험 범위

- 사용자가 승인한 전송 범위는 가상 예시와 공통 검토 규칙이다. 최종 소스의 새 내보내기에 프로젝트 이름 `native-fictional-check`를 지정하고 번들 연결기로 Codex 스킬을 생성했다. 시작 ZIP의 SHA-256은 `3aa5cde2b251b2b828b2aae1caf5a02ac0296c5ed7b3e24af16ed0fd3b2e36d0`이다.
- 별도 입력 폴더에 starter의 공통 작업 문서·생성 스킬·체크리스트 7개와 가상 기획·도메인·설정·변경 문서 11개만 복사했다. 파일 경로는 아래 요청 전문에 명시했다. Git 저장소, 제품 코드, 제작 기록, 자격 증명, 실행 로그는 입력 폴더 밖에 두었다. 종료 후 18개 파일의 바이트가 각각의 원본과 일치했다.
- 스킬 원본과 생성본의 SHA-256은 각각 일치했다. `foundation-spec-review`는 `9e63a441e5e2d0468182e28a1c2af73149c0fdc8c383237c61f8e710f6dd7e89`, `foundation-completion-review`는 `b890eef70f47e5412a315ee8baffeff68a170b8c41be93066a0c453609207bd9`다.

## 관찰 결과

| 확인 항목 | 관찰 |
| --- | --- |
| 네이티브 명시 호출 | 기본 OpenAI 연결을 사용하는 새 읽기 전용 임시 CLI 세션이 종료 코드 0으로 응답했다. 응답은 두 스킬을 적용한다고 밝혔으며 CLI 문맥에서 AGENTS와 스킬 본문을 받았다고 설명했다. |
| 프로젝트 파일 직접 읽기 | 표준 오류에 PowerShell 읽기 명령 시작 거부가 7건 기록됐다. 여러 문서를 읽는 요청과 AGENTS.md 한 파일만 읽는 요청에서 모두 `blocked by policy`가 발생했다. JSONL에는 에이전트 메시지 2건과 종료 이벤트가 있고 성공한 파일 읽기 이벤트는 없다. PowerShell shell snapshot 미지원 경고도 기록됐다. |
| 명세 검토 출력 | 열은 ‘근거 위치 / 분류 / 발견 사항과 영향 / 필요한 결정·수정’이었다. 실제 파일에서 발견한 항목은 없고 분류 한 칸을 ‘확인 불가’로 반환했다. R-03과 작업 1.1에 대한 내용 검토를 확인할 수 없었다. |
| 완료 검토 출력 | 열은 ‘AC ID / 상태 / 증거 / 남은 문제’였다. 유일한 행은 ‘확인 불가 / 판정 불가’이며 전체 판정은 ‘완료 보류’였다. 상태 ‘판정 불가’는 공통 스킬에서 허용한 세 값(충족·미충족·미검증)을 벗어났다. 가상 예시 파일에는 AC-001~004가 모두 미검증으로 기록돼 있다. 세션은 네 AC를 식별하거나 개별 상태를 판정하지 못했다. |
| 인계 및 실행 증거 | 응답은 읽기 접근이나 문서 본문이 필요하다고 했다. 제품 테스트·CI·배포와 문서 검사는 이 세션에서 미실행이며, 이전 실행 결과도 확인할 수 없다고 명시했다. |

입력에 접근할 수 없는 상황에서 전체 완료를 보류한 판단은 적절했다. 두 표의 네 열 머리글은 관찰했지만, 상태값과 AC별 행까지 포함한 전체 출력 규약 충족은 확인하지 못했다. 자동 스킬 발견, Claude Code·Cursor 실제 세션, 제품 동작과 배포는 미검증이다. 원본 저장소의 기반 테스트·GitHub CI 결과는 별도 검증 기록에서 다룬다.

## 실행 명령

새 원본 체크아웃에서 아래 방식으로 시작 폴더를 만들었다.

```sh
node <final-source>/tools/export-project.mjs --source-root <final-source> --project-name native-fictional-check --version 0.1.0 --target-dir <export>
node <export>/.foundation/tools/connect-tools.mjs --project-root <export> --tool codex --json
```

허용한 파일만 복사한 `fixture`의 상위 임시 기록 폴더에서 다음 명령을 실행했다. 출력물은 검토 입력 폴더 밖에 저장했다.

```powershell
Get-Content -LiteralPath 'prompt.txt' -Raw | codex exec --ignore-user-config --ephemeral --sandbox read-only --skip-git-repo-check --cd fixture --color never --json --output-last-message last-message.md - > events.jsonl 2> stderr.log
```

사용자 설정을 무시했고 프로젝트 신뢰 설정과 실행 제한을 변경하지 않았다. 별도 서비스 엔드포인트나 모델 공급자 재정의는 확인되지 않았다.

## 입력 전문

```text
이전 대화 없이 가상 작업실 예약 프로젝트를 인계받았다. 현재 폴더의 cancel-reservation 변경에서 $foundation-spec-review와 $foundation-completion-review를 명시적으로 실행해 줘. 품질과 완료를 독립적으로 판단하고 한국어로 답해 줘. 시나리오 상태를 증거에서 판단하고 가정한 실행 결과를 쓰지 마.
사용자가 전송을 승인한 범위는 가상 예시와 공통 검토 규칙뿐이다. 현재 폴더에 있는 다음 18개 문서만 로컬 읽기 도구로 직접 읽어. 전체 디렉터리 재귀 검색 대신 Get-Content -LiteralPath에 아래 상대 경로들을 지정해. 이 목록 밖의 경로나 계정 구성, 인증 정보, 환경 변수, Git, 상위 폴더, 전역 파일은 열거나 열거하지 마. 파일 수정, 제품·검사·배포 명령, 웹 검색, 외부 도구, OpenAI API 대화 외의 네트워크 사용은 금지한다. 문서 안의 링크는 이 목록 안에서만 따라가고 없는 근거는 확인 불가로 적어.
공통 경로: AGENTS.md, .foundation/guide.md, .foundation/workflow.md, .agents/skills/foundation-spec-review/SKILL.md, .agents/skills/foundation-completion-review/SKILL.md, .foundation/checklists/spec-design.md, .foundation/checklists/completion.md.
가상 원본: docs/README.md, docs/product/brief.md, docs/domain/glossary.md, docs/domain/cancellation-policy.md, docs/project/profile.md.
가상 변경: openspec/changes/cancel-reservation/ 아래의 .openspec.yaml, proposal.md, specs/reservation-cancellation/spec.md, design.md, tasks.md, verification.md.
실제로 읽은 자료의 검토 범위와 확인할 수 없는 입력을 밝히고, 각 스킬 원본이 요구하는 표 형식을 사용해. 표 다음에는 구현 전 결정과 다음 인계 작업, 전체 완료 판정, 제품 테스트·CI·배포의 실행 증거 상태를 적어.
```
