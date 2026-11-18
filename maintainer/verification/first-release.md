# 0.1.0 첫 사용 검증 기록

2026-11-18, Windows x64, Node.js 24.14.0, Git 2.53.0.windows.2에서 기반 관리 도구와 문서 흐름을 확인했다. [가상 예약 서비스](../../examples/reservation-cancellation/README.md)의 제품 테스트·CI·배포는 미실행이다. 기반 원본 CI는 Windows·Linux와 Node 22.20.0·24.14.0을 조합하도록 설정했고, 이 기록 작성 시 GitHub 실행 결과는 대기 중이다.

## 확인한 인수 조건

| ID | 판정 | 실제 확인 범위와 남은 사항 |
| --- | --- | --- |
| AC-01 | 충족 | 빈 임시 폴더로 내보낸 뒤 제품 패키지 없이 고정 CLI를 준비했다. 초기화, 변경 생성, 산출물 지침 조회, 예시 문서 작성 결과를 검사했다. 첫 다운로드에는 네트워크가 필요했다. |
| AC-02 | 충족 | [문서 지도](../../examples/reservation-cancellation/docs/README.md)에서 취소 정책과 변경을 찾아 R-01~03, AC-001~004, 설계의 책임, 구현·검증 작업, AC별 검증 기록을 대조했다. |
| AC-03 | 충족 | 본인 취소, 타인 거부, 사용 중 충돌, 동일 키 재시도 각각의 WHEN/THEN과 기대 상태·이력·반환값을 명세와 체크리스트에서 대조했다. 보관 기간 경계는 구현 전 결정할 항목으로 표시했다. |
| AC-04 | 미검증 | 변경명·미정 사항·다음 작업·증거 위치는 예시에 있다. 최종 프로젝트 전체를 새 작업자가 로컬 파일에서 읽어 인계받은 실제 세션 결과는 확보하지 못했다. 아래에 명시 호출·발췌본 평가 범위를 기록했다. |
| AC-05 | 충족 | [Java·VM](../../examples/profiles/java-vm.md)과 [Python·컨테이너](../../examples/profiles/python-container.md)에 같은 다섯 항목으로 기술·실행 환경·명령·검토 방식·미정 사항을 작성했다. 공통 양식을 수정할 필요가 없었다. 예시 명령은 미실행이다. |
| AC-06 | 충족 | [구조 검사 테스트](../../tests/check-project.test.mjs)의 정상 문서와 결함 사례로 빈 항목, 끊긴 링크, 누락·중복 ID 및 미연결 작업을 확인한다. 공식 OpenSpec 문법 검사는 별도로 실행했다. |
| AC-07 | 충족 | [예시 검증 기록](../../examples/reservation-cancellation/openspec/changes/cancel-reservation/verification.md)은 실행 전 네 AC를 모두 미검증으로 둔다. 실제 발췌본 평가에서도 작업 체크·문서 검사 통과로 제품 AC를 승인하지 않았다. 아래 회귀 시험에서 관찰한 실패·통과는 기반 도구의 결과다. |
| AC-08 | 충족 | [비교](../../tests/compare-update.test.mjs)와 [기준 기록](../../tests/record-baseline.test.mjs) 테스트에서 관리 파일 수동 반영, 변경된 연결 처리, 프로젝트 내용 보존, 신규 관리 경로별 승인을 확인한다. [되돌리기 안내](../../distribution/managed/updating.md)에 Git 복구 절차를 명시했다. |
| AC-09 | 충족 | 임시 사본의 실제 archive 후 현재 명세에 네 시나리오가 남고 변경 원본은 날짜가 붙은 보관 경로로 이동했다. 예시 원본은 검토 중인 상태로 보존했다. |
| AC-10 | 충족 | 정확한 내보내기 목록, 원본과 다른 프로젝트용 AGENTS, 원본·예시·프로젝트 패키지·기반 CI 제외를 확인했다. PR 양식과 관리 지침은 배포물에 들어간다. |

## 재현과 관찰

원본에서 `npm ci --ignore-scripts`로 lockfile을 설치했다. 직접 의존성은 OpenSpec 2.1.0, fflate 0.8.3, marked 18.2.1이다. 실제 설치 시 npm 캐시를 지정하고 감사·후원 출력을 껐다. 아래 `openspec`은 원본 테스트에서는 `node node_modules/@fission-ai/openspec/bin/openspec.js`의 절대 경로, 새 프로젝트에서는 `npm exec --yes --ignore-scripts --package=@fission-ai/openspec@2.1.0 -- openspec`을 가리킨다. 테스트는 각 프로젝트를 별도 임시 폴더에 만들고 OpenSpec 전역 설정·데이터 디렉터리도 격리한다.

| 명령·시험 | 관찰 |
| --- | --- |
| `node --test tests/journey.test.mjs tests/openspec-compatibility.test.mjs` | 구현 전 0/5. PR 양식·샘플·CLI가 없었고 새 Git clone의 해시가 달라졌다. 구현 후 같은 명령 5/5. |
| `openspec --version`, `init --help`, `new change --help`, `instructions --help`, `validate --help`, `archive --help` | 2.1.0에서 프로젝트 범위, 산출물 이름, 명명된 변경의 strict/JSON 검증, archive의 확인 옵션을 확인했다. |
| `openspec init --tools none --scope project` → 수동 설정 비교 → `openspec new change first-feature` → `openspec instructions proposal --change first-feature --json` | 원본 저장소 밖 새 프로젝트에서 npm 최초 다운로드 후 실행했다. 생성된 기본 설정에 규칙을 반영한 뒤 기반 제목 규칙이 출력됐다. 제품 package.json·node_modules는 생성되지 않았다. |
| `openspec instructions <산출물> --change cancel-reservation --json` | 빈 변경을 만든 뒤 proposal·specs·design·tasks 각각의 JSON에 context와 해당 산출물의 규칙이 들어갔다. 설치된 CLI와 지정 스키마로 확인했다. |
| `openspec validate cancel-reservation --strict --json` | 실제 변경 ID의 항목이 valid였고 예시에는 AC를 표기한 네 Scenario가 있었다. |
| `openspec archive cancel-reservation --yes` | 임시 사본에서 확인 질문을 생략해 명세 병합과 보관 동작만 검증했다. 작업이 열린 가상 서비스의 완료 증거로 사용하지 않는다. |
| Git 새 clone | 세 도구를 연결한 임시 프로젝트에서 로컬 시험용 신원으로 commit하고 `git -c core.autocrlf=true clone --no-local`로 다른 디렉터리에 체크아웃했다. 모든 관리 파일·연결의 SHA-256과 lock 바이트가 일치했다. 제품 코드·다른 도구 스킬 경로의 text 속성은 지정되지 않았다. |

전체 `npm test`는 처음 70/71이었다. 기존 구조 검사 테스트가 starter 루트 목록을 고정해 새 PR 양식 폴더와 Git 속성 파일을 거부했다. 검사 전후 파일 목록 보존을 비교하도록 수정하고 해당 테스트 1/1, 전체 재검증 71/71(실패·건너뜀 0)을 확인했다. 정확한 배포 목록은 내보내기 테스트에서 별도로 검증한다.

원본 문서·예시·내보낸 프로젝트 및 변경 폴더에 복사한 검증 양식 등 Markdown 48개에서 지원 범위의 상대 링크 114개가 존재하는 경로로 연결됐다. 문서 강제 조건과 JSON 동작은 [여정 테스트](../../tests/journey.test.mjs)와 [OpenSpec 호환성 테스트](../../tests/openspec-compatibility.test.mjs)에서 재현할 수 있다. 공식 참조는 [고정 버전 spec-driven 스키마](https://github.com/Fission-AI/OpenSpec/tree/v2.1.0/schemas/spec-driven)다.

## AI 세션과 인계 범위

- Codex CLI 0.169.0-alpha.11.1에서 이전 단계의 생성본으로 `$foundation-completion-review`를 명시한 실제 발췌본 평가가 종료 코드 0을 반환했다. 응답의 네 열은 `AC ID / 상태 / 증거 / 남은 문제`였다. 두 조건 모두 미검증, 전체는 완료 보류였다. 세션 이벤트에는 에이전트 메시지만 있고 파일 읽기 도구 호출은 없었다.
- 별도 평가에서 명세·설계 검토 스킬 원본과 체크리스트를 제공한 뒤 네 열의 발견 사항과 구현 전 결정 항목을 관찰했다. [평가 입력·결과](skill-evaluation.md)
- 최종 내보내기에서 Codex 연결을 생성하고 가상 문서를 놓았다. `codex exec --ignore-user-config --ephemeral --sandbox read-only --skip-git-repo-check --cd <시범 폴더> --color never --json --output-last-message <임시 결과> -`에 명시적인 스킬 이름과 아래 요청을 제공했다. Windows 소켓 접근 제한(10013)으로 모델에 연결하지 못했다. 네트워크 재시도는 자동 승인 검토에서 비공개 로컬 문서를 외부 API로 전송할 명시적 사용자 승인이 없다는 사유로 거절됐다. 로컬 파일 읽기·발견 사항 출력·자동 스킬 탐색은 미검증이다.
- 요청 범위는 “이전 대화 없이 합류한 작업자로서 `$foundation-spec-review`로 cancel-reservation을 검토한다. 로컬 스킬·체크리스트·문서 지도·기획·도메인·설정·proposal·specs·design·tasks·verification을 직접 읽고, 공통 형식으로 근거·분류·영향·필요한 결정을 적는다. 다음 작업과 테스트·배포 증거 상태를 밝힌다. 파일을 수정하거나 제품 명령을 실행하지 않는다”였다.
- Claude Code는 실행 파일을 확인하지 못했고 Cursor는 편집기 명령만 발견했다. 두 도구는 모두 연결 파일 생성만 검증했다. 제품 구현·테스트·배포는 도구별 세션 평가 범위 밖이다.

## 제작 중 결정과 비용

| 결정 | 이유와 유지보수 범위 |
| --- | --- |
| 새 로컬 저장소의 기능 브랜치에서 작업별 구현자와 독립 검토를 사용 | 기존 제품 저장소를 수정하지 않고 앞 작업의 경로·소유권 계약을 다음 작업에 전달한다. Windows에서 Bash가 기록 경로에 쓸 수 없어 제작 기록에만 PowerShell을 사용했다. |
| 개인 계정 116Lv의 비공개 저장소 사용 | 공개 전환과 라이선스 결정은 별도다. 이 기록은 원격 CI나 릴리스 게시를 입증하지 않는다. |
| 관리 환경만 Node에 의존하며 연결·업데이트 런타임을 명시적으로 배포 | ZIP만 받은 이용자도 원본 없이 작업할 수 있다. 관리할 파일 수가 늘고 새 배포 파일은 목록에 개별 등록한다. |
| 기존 파일을 보존하고 연결의 쓰기 전 복구 정보를 기록 | 직접 편집·경합 시 작업을 멈추며 비정상 종료는 복구 지침을 따른다. 전원 장애 및 자동 복구는 미검증이다. |
| 공식 marked 18.2.1 ESM과 MIT 라이선스를 검사기에 포함 | 일반 Markdown 문맥에서 발생한 오탐·누락을 줄이며 제품 npm 설치를 피한다. 파서 출처·바이트 및 향후 버전을 관리해야 한다. |
| 기본 OpenSpec 제목을 보존하고 변경별 `.openspec.yaml`의 명시적 `skip_specs: true`만 허용 | 실제 기능에 빈 명세가 통과하는 것을 방지한다. 기반 검사가 지원하는 YAML·링크 문법의 범위는 워크플로에 명시한다. |
| 관리 경로에만 Git 바이트 보존 속성 적용 | Windows의 자동 줄바꿈 변환으로 인한 거짓 수정 보고를 막는다. 새 생성 경로를 추가할 때 속성도 검토한다. |
| 비교는 읽기 전용이며 새 관리 경로마다 명시적으로 승인 | 같은 바이트도 기존 파일의 소유권 증명이 될 수 없다. 수동 복사 후에도 추가 경로마다 `--acknowledge-new-path`를 지정한다. |
| PR 양식을 starter에 넣고 CI는 원본에서만 실행 | 프로젝트별 기술을 고정하지 않고 AC·증거를 일관되게 제출한다. 원본은 고정된 Actions 버전과 네 가지 OS·Node 조합을 유지한다. [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) · [setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0) |
