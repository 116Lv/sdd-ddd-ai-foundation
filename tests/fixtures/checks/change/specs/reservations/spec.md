## ADDED Requirements

### Requirement: 예약 처리

시스템은 재고가 있는 상품을 예약해야 한다 (MUST).

#### Scenario: [AC-001] 재고가 있는 상품을 예약한다

- **WHEN** 재고가 있는 상품에 예약을 요청한다
- **THEN** 예약을 승인한다

#### Scenario: [AC-002] 재고가 없는 상품을 거절한다

- **WHEN** 재고가 없는 상품에 예약을 요청한다
- **THEN** 예약을 거절한다
