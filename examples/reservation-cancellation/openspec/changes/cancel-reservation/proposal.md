## Why

작업실 이용자가 첫 출시에서 예약을 직접 취소할 수 있어야 한다. 제품 목표의 원본은 `docs/product/brief.md`다.

## What Changes

예약 취소 요청과 결과 조회를 제공한다. 중복 요청의 처리 결과를 명세에 포함한다.

## Capabilities

### New Capabilities

- `reservation-cancellation`: 예약자의 취소 요청을 처리하고 결과를 관찰할 수 있다.

### Modified Capabilities

없음. 첫 변경이다.

## Impact

예약 상태와 취소 이력이 영향을 받는다. [설계](design.md)에 처리 경계를 기록한다.

## Out of Scope

관리자 대리 취소, 환불과 알림은 이번 변경에서 제외한다.

## Actors and Permissions

예약자와 다른 회원의 권한 판단 기준은 `docs/domain/cancellation-policy.md`의 R-01을 따른다.

## Open Questions

요청 키 보관 기간은 미정이다. [설계](design.md)의 미정 사항을 구현 전에 결정한다.
