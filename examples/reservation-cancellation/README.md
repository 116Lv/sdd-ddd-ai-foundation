# 가상 사례 · 공유 작업실 예약 취소

작업실 이용자가 예약을 직접 취소하는 첫 변경이다. 아래 문서는 빈 시작 프로젝트에서 작성할 내용을 보여준다. 원본 저장소에서만 제공하는 참고 자료다.

1. [제품 개요](docs/product/brief.md)와 [업무 용어](docs/domain/glossary.md)에서 취소할 사람과 대상을 확인한다.
2. [예약 취소 정책](docs/domain/cancellation-policy.md)을 읽고 [변경 제안](openspec/changes/cancel-reservation/proposal.md)에서 변경의 범위를 찾는다.
3. [변경 명세](openspec/changes/cancel-reservation/specs/reservation-cancellation/spec.md)에서 시나리오를, [설계](openspec/changes/cancel-reservation/design.md)에서 책임과 원자성 경계를 확인한다.
4. [작업](openspec/changes/cancel-reservation/tasks.md)과 [검증 기록](openspec/changes/cancel-reservation/verification.md)을 대조해 다음 작업과 미검증 범위를 파악한다.

이 디렉터리의 `docs/`와 `openspec/`는 시작 프로젝트 위에 놓을 예시 문서다. 소스 테스트는 매번 새 임시 프로젝트에 두 디렉터리를 복사한다. 보관 명령을 실험하는 테스트도 임시 사본만 사용한다. 제품 구현·테스트·배포는 진행 전이며 이 변경은 검토 중이다.
