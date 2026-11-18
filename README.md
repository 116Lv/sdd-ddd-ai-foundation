# 재사용 가능한 SDD 개발 기반

제품의 업무 용어와 규칙을 DDD 관점에서 정리하고, OpenSpec 변경 하나에 기대 동작·설계·작업·검증 증거를 연결합니다. 제품의 언어, 프레임워크와 배포 환경은 프로젝트에서 선택합니다.

## 새 프로젝트 시작

시작용 ZIP이 있다면 새 폴더에 풀고 그 안의 `README.md`에서 시작합니다. 원본에서 직접 만들 때는 Node.js 22.20.0 이상으로 아래 명령을 실행합니다. 최초 의존성 설치에는 npm 레지스트리 접근이 필요합니다. 릴리스는 해당 커밋을 새로 체크아웃한 소스에서 만듭니다. 원본의 Git 속성은 배포 입력의 줄바꿈을 LF로 고정하며 vendored 파일은 배포처의 바이트를 보존합니다. 대상은 새 폴더 또는 빈 폴더로 지정합니다.

```sh
npm ci --ignore-scripts
node tools/export-project.mjs --target-dir ../my-project --version 0.1.0 --project-name "내 프로젝트"
node tools/package-release.mjs --project-dir ../my-project --zip-path ../my-project.zip
```

마지막 명령은 방금 내보낸 폴더를 ZIP으로 전달할 때 사용합니다. 새 프로젝트에서 `.foundation/getting-started.md`를 따라 기획과 도메인 용어를 작성하고, 고정 버전 OpenSpec을 초기화해 첫 변경을 엽니다. [도구별 AI 연결](integrations/README.md) · [업데이트 절차](distribution/managed/updating.md)

## 작성 예시와 검증 범위

- [예약 취소 예시](examples/reservation-cancellation/README.md)에서 권한 거부·상태 충돌·재시도 시나리오와 미검증 기록을 확인합니다.
- 같은 설정 양식으로 기술 선택을 표현한 [Java·가상 머신](examples/profiles/java-vm.md)과 [Python·컨테이너](examples/profiles/python-container.md) 예시를 비교합니다.
- 기반 자체의 실행 환경, 인수 조건별 증거와 미검증 범위는 [첫 버전 검증 기록](maintainer/verification/first-release.md)에 있습니다.

## 원본 저장소 작업

[원본 개발 지침](AGENTS.md), [요구사항](maintainer/requirements.md), [구조 설계](maintainer/design.md), [구현 계획](maintainer/implementation-plan.md)을 확인합니다. 공통 파일은 `distribution/managed/`, 프로젝트가 처음 받는 문서는 `distribution/starter/`에서 수정합니다. 내보낼 파일은 [배포 목록](releases/distribution-map.json)에 개별 등록합니다.

```sh
npm ci --ignore-scripts
npm test
```

관리 도구 검증에는 Node.js와 Git을 사용합니다. GitHub Actions는 이 원본의 도구·문서만 검사합니다. 라이선스는 미정이며 저장소는 비공개입니다.
