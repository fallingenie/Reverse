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

## 출력

`schemas/session.schema.json`에 맞는 새 JSON을 출력한다. 설명문이나 코드 펜스를 섞지 않는다.

## 금지

- `UNKNOWN`을 사실로 바꾸기
- 부정 사실 삭제하기
- 학생 선택을 더 그럴듯한 행동으로 고치기
- 출처 ID 제거하기
- 이전 오류와 교정 기록 지우기
