# 재사용 가능한 SDD 개발 기반

업무 용어와 규칙, 경계와 책임을 DDD 관점에서 정리하고, 그 결과를 OpenSpec 명세에 연결합니다. 사람과 AI는 같은 명세를 기준으로 기능을 구현하고 인수 조건으로 결과를 검증합니다.

제품 프로젝트는 시작용 배포물에서 출발해 기획·도메인·기술·실행 방법을 정합니다. 배포물에는 공통 지침과 양식, 프로젝트가 채울 시작 문서가 들어갑니다.

## 원본 저장소 작업

- 기반 자체를 변경할 때 [요구사항](maintainer/requirements.md), [구조 설계](maintainer/design.md), [구현 계획](maintainer/implementation-plan.md)을 확인합니다. 제작 문서는 작성 당시의 초안과 계획을 보관합니다.
- `distribution/managed/`는 배포 후 `.foundation/`에 들어가는 공통 파일의 원본입니다.
- `distribution/starter/`는 배포 시 한 번 생성하는 프로젝트 소유 문서의 원본입니다. 새 프로젝트의 이름은 이 양식의 `{{PROJECT_NAME}}`에 들어갑니다.
- 변경을 시작할 때 [원본 개발 지침](AGENTS.md)을 확인합니다.
