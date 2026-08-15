# Prompt 06: 기억 압축

## 목적

긴 대화가 요약되더라도 수업의 인과, 근거, 학생 선택, 교정을 잃지 않는 새 압축본을 만든다.

## 입력

- 원본 세션 JSON
- 이전 압축본이 있다면 그 파일
- 새로 추가된 턴 목록

## 지시

1. 원본의 세션 ID, 버전, 압축 순번을 확인한다.
2. `canon`, `negative_facts`, `corrections`, `open_threads`를 그대로 보존한다.
3. `episode_archive`는 각 항목의 ID, 턴, 학생 선택, 결과, 근거 ID, `must_keep`을 남기고 묘사만 줄인다.
4. 새 정보와 기존 요약이 충돌하면 임의로 합치지 말고 `conflicts`에 넣는다.
5. 삭제한 세부의 종류와 개수만 `discarded_detail_summary`에 기록한다.
6. 압축 전후의 절대 보존 ID 집합이 같은지 검사한다.

## 델타 검증 경계

- `memory-delta.schema.json`은 필드와 자료형 같은 구조만 검사한다.
- 실제 Node 도구가 있는 호스트에서는 신뢰된 세션 문맥 파일과 함께 `scripts/validate-memory-delta.mjs`를 실행해 안전 정수 revision, `next_revision = base_revision + 1`, 현재 revision 일치, 새 ID, 허용 경로, typed 근거·provenance 해시, 체크포인트, 교정 영향, 교정 본문에 결합된 사용자 결정 상태를 추가로 검사한다.
- ChatGPT Knowledge와 Copilot Studio의 첨부 파일은 참조 전용이다. 그 환경에서 Node 검증기가 실행됐다고 주장하지 않는다.
- 의미 검증을 실행할 도구가 없거나 필요한 세션 문맥을 읽지 못하면 델타를 적용하지 않고 `확인 필요`로 둔다.

## 출력

`schemas/session.schema.json`에 맞는 새 JSON을 출력한다. 설명문이나 코드 펜스를 섞지 않는다.

## 금지

- `UNKNOWN`을 사실로 바꾸기
- 부정 사실 삭제하기
- 학생 선택을 더 그럴듯한 행동으로 고치기
- 출처 ID 제거하기
- 이전 오류와 교정 기록 지우기
- `/memory/canon`, 출처, 검증 사실, T0/T1 레코드를 `add` 또는 `resolve`로 직접 변경하기
- JSON Pointer escape나 중복 작업으로 허용 경로 검사를 우회하기
- 사용자 결정 대기 교정을 승인된 것처럼 적용하기
