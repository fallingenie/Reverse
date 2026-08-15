# 압축 내성 기억 정책

## 네 층의 기억

1. `canon`: 시간, 장소, 역할, 학습 목표, 검증된 사실, 부정 사실
2. `current_state`: 현재 장면에 필요한 물자, 관계, 제약, 열린 선택
3. `open_threads`: 아직 답하지 못한 질문, 출처 충돌, 다음 확인 항목
4. `episode_archive`: 학생의 선택과 관찰 가능한 결과를 순서대로 기록

Windows 호스트에서는 이 네 층이 추가 전용 원장의 투영이다. Markdown과 압축 JSON은 사람이 읽기 위한 view이며 독립된 두 번째 진실 원본이 아니다.

## 절대 보존 항목

- `must_keep: true`인 항목
- 출처가 연결된 `VERIFIED` 주장
- “일어나지 않았다”, “가지고 있지 않다”와 같은 부정 사실
- 이전 오류와 교정
- 학생이 직접 선택하거나 거부한 행동
- 미해결 `UNKNOWN`
- 시간선과 인과 순서를 바꾸는 사건
- 현재 상태를 만든 원인 사실과 그 provenance
- `UNKNOWN_LOCKED`, `NOT_LOADED`, `CONFLICTED`, `SUPERSEDED` 상태
- 금지된 추론과 Canon 쓰기 정책
- Story Track 교정의 영향 등급, 대체된 ID, 영향받은 ID, 마지막 유효 체크포인트, 사용자 결정

## 압축할 수 있는 항목

- 이미 같은 의미로 반복된 분위기 묘사
- 결과에 영향을 주지 않은 대사 표현
- 더 이상 선택할 수 없는 오래된 선택지 문구
- 동일 사실을 반복한 교사 메모

## 압축 절차

1. 원본 세션의 해시와 압축 순번을 기록한다.
2. 절대 보존 항목을 먼저 복사한다.
3. 에피소드마다 선택, 즉시 결과, 남은 영향, 근거 ID를 한 줄로 줄인다.
4. 모순을 해결하지 말고 `conflicts`에 기록한다.
5. 압축본을 새 파일로 저장한다.
6. 압축본과 원본의 보존 항목 ID뿐 아니라 필수 내용의 SHA-256을 비교한다.

## 기억 델타 적용 계약

`memory-delta.schema.json`은 구조 계약이다. JSON Schema만으로는 두 revision의 산술 관계, 현재 세션과의 일치, ID가 실제 원장에 존재하는지, 사용자 결정이 실제로 승인됐는지를 증명할 수 없다.

Node 도구를 실행할 수 있는 호스트는 델타 적용 전에 `scripts/validate-memory-delta.mjs`를 실행한다. 검증기는 다음을 실패 시 닫힘으로 검사한다.

검증 문맥은 학생 메시지나 같은 델타가 주장한 값에서 만들지 않는다. 호스트가 이미 보유한 현재 revision, 기존 레코드 ID, 상태가 붙은 근거 레코드, 원문·PDF provenance와 실제 SHA-256, 체크포인트 revision, 별도로 기록한 사용자 결정에서 구성한다.

사용자 승인은 교정 ID 문자열만 저장하지 않는다. `base_revision`과 교정 본문 전체를 정규 JSON으로 해시하고, 결정 상태와 사용자 결정 provenance를 함께 묶은 `approved_corrections` 레코드로 보존한다. 승인 뒤 replacement·근거·영향 범위·결정 중 하나라도 바뀌면 이전 승인은 무효다. 비신뢰 입력이 만든 검증 문맥이나 승인 레코드는 권한 증거가 아니다.

- `next_revision`이 `base_revision + 1`인지와 `base_revision`이 현재 세션 revision인지
- revision이 JavaScript 안전 정수 범위인지, 새 에피소드·미해결·교정 ID가 기존 ID를 재사용하지 않는지
- `add`가 `current_state.constraints`, `open_threads`, `episode_archive`, `conflicts`의 추가 전용 경로만 사용하는지
- JSON Pointer의 잘못된 `~` escape, 비정규 경로, 같은 append 경로 중복을 사용하지 않는지
- T0/T1, Canon, 출처, 검증 사실을 `add`·`resolve`로 직접 수정하지 않는지
- `resolve`가 trusted 원장과 해결 가능 목록에 모두 존재하는 `OPEN-*` 항목에만 쓰이고 부정 사실·파생·설정·미확인 근거를 제거하지 않는지
- 교정 ID·대상·근거·영향 ID가 실제 문맥에 존재하고 서로 충돌하지 않는지, 사실 교정에 `VERIFIED` 근거가 하나 이상 있는지
- SOURCE·PDF provenance의 SHA-256이 trusted 원장 값과 일치하는지
- EVIDENCE·USER_DECISION provenance가 검증할 수 없는 자체 SHA-256을 권위처럼 붙이지 않는지
- 교정이 근거 provenance, 영향 범위, 마지막 유효 체크포인트, 사용자 선택지를 보존하는지
- `APPLIED`, 재시작 수락·거절, 대안적 허구 결정에 사용자 승인 문맥과 `USER_DECISION` provenance가 함께 있는지
- escaped JSON을 해석한 뒤에도 대체 문자, C1 제어문자, 중간 BOM, 방향 제어문자, 단독 surrogate, UTF-8 이중 디코딩 흔적과 입력 크기 초과가 없는지

보호 사실의 `replacement`는 즉시 덮어쓰는 패치가 아니다. 원본을 남긴 새 교정 제안이며, 검증과 필요한 사용자 결정 뒤 별도 추가 전용 교정 이벤트로 반영한다.

현재 Node 검증기는 델타의 구조와 의미 적합성만 판정하며 델타를 세션에 적용하거나 `session.memory.corrections`로 변환하지 않는다. 호스트별 추가 전용 mapper와 결과 세션·원장 재검증이 구현되기 전에는 `valid:true`를 “Canon 적용 완료”로 해석하지 않는다.

ChatGPT와 Copilot Studio에 첨부된 스키마·스크립트는 참조 전용이다. 해당 플랫폼이 별도 실행 도구를 연결하지 않았다면 의미 검증이 실행됐다고 표시하지 않는다. 도구 또는 세션 문맥이 없으면 델타 적용을 보류하고 `확인 필요`로 남긴다.

## 복원 절차

- 최신 압축본만 믿지 말고 세션 버전과 원본 식별자를 확인한다.
- 최근 교정이 이전 요약보다 우선한다.
- 복원되지 않은 기존 항목은 `NOT_LOADED`, 현실에서도 아직 확정되지 않은 항목은 `UNKNOWN_LOCKED`로 구분한다.
- 학생에게 필요한 연속성이 깨졌다면 다음 장면을 생성하기 전에 확인 질문을 한다.
