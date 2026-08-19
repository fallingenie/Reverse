# 학년 선택을 실제 버튼으로 표시하기

## 목적

Agent가 `몇 학년인가요?` 뒤에 번호가 적힌 일반 텍스트를 생성하는 대신 Copilot Studio의 `Question` 노드와 `Multiple choice options`를 사용해 실제 선택 버튼을 표시합니다.

## 적용 파일

`topics/reverse-grade-buttons.topic.yaml`

이 파일은 학생용 Skill ZIP에 넣는 지원 자료가 아니라 Copilot Studio의 별도 Custom Topic입니다. Skill 파일을 교체하는 것만으로는 버튼이 생기지 않습니다.

## Copilot Studio 적용 순서

1. 대상 Agent에서 `Topics`를 엽니다.
2. Custom Topic `Reverse Grade Buttons`를 새로 만듭니다.
3. Topic의 메뉴에서 `Open code editor`를 선택합니다.
4. `reverse-grade-buttons.topic.yaml` 전체를 붙여 넣고 저장합니다.
5. Test panel을 새 대화로 초기화합니다.
6. `초등학교`를 입력하고 `3학년`, `4학년`, `5학년`, `6학년`이 실제 버튼으로 보이는지 확인합니다.
7. 같은 방법으로 중학교는 1~3학년, 고등학교는 1~2학년을 확인합니다.
8. 버튼을 누른 뒤 과목 질문으로 이어지는지 확인합니다.
9. 저장 후 게시하고 실제 WebChat에서도 같은 버튼을 확인합니다.

## 실패 시 판정

- 번호 목록만 보이면 Topic이 호출되지 않은 상태입니다. Instructions의 `버튼` 문구만으로는 실제 UI가 만들어지지 않습니다.
- Topic 저장 오류가 나면 현재 Agent에서 새 Question 노드를 하나 만든 뒤 `Multiple choice options`를 선택하고, 코드 편집기에서 생성된 YAML과 이 파일을 비교합니다. Agent별 생성 ID 차이는 그대로 유지합니다.
- 버튼이 Preview에서만 보이고 WebChat에서 보이지 않으면 게시 상태와 채널 지원 여부를 따로 확인합니다.

로컬 파일과 회귀검증 통과는 Studio 저장·게시·WebChat 동작 증거가 아닙니다. 세 환경의 실제 화면을 확인하기 전까지 라이브 판정은 `HOLD`입니다.
