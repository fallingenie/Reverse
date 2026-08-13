# Reverse

초등학교 3학년부터 고등학교 2학년까지 사용할 수 있는 근거 기반 시나리오 수업 프로토타입입니다. 학생은 역사·사회·과학 등의 주제를 역할 기반 장면으로 탐구하되, 실제 사실과 반사실 가정, 추론, 미확인 내용을 항상 구분합니다.

이 저장소는 `Singulari-Tea Codex` v4의 공개된 모듈형 프롬프트 구조와 사용자가 제공한 후속 사용 경험을 참고해 교육용으로 재설계했습니다. 원 프로젝트의 고유 세계관과 런타임 명칭은 사용하지 않으며, 교육 목표·근거 등급·학년 적응·압축 내성 기억을 새로 정의했습니다.

## 핵심 동작

1. 학년, 공부 중인 과목, 관심사를 먼저 묻습니다.
2. 답변에 맞춘 시나리오 다섯 개와 직접 입력 선택지를 제시합니다.
3. 학생이 시나리오를 선택한 뒤 `[시작]`을 입력해야 수업이 시작됩니다.
4. 각 주장은 `VERIFIED`, `DERIVED`, `SCENARIO`, `UNKNOWN`으로 구분됩니다.
5. 기억 압축 후에도 핵심 사실, 부정 사실, 선택 결과, 교정, 미해결 질문과 출처를 보존합니다.
6. 학생용 장면과 교사용 근거·평가 메모를 분리합니다.

## 구성

- `skills/teach-grounded-scenarios/SKILL.md`: 실행 절차
- `skills/teach-grounded-scenarios/instructions/`: 배포 가능한 지침
- `skills/teach-grounded-scenarios/prompts/`: 단계별 프롬프트 예시
- `skills/teach-grounded-scenarios/references/`: 학년, 근거, 기억, 안전 정책
- `skills/teach-grounded-scenarios/schemas/`: 세션과 턴 JSON Schema
- `skills/teach-grounded-scenarios/examples/`: 초6 광복절 예시 수업
- `skills/teach-grounded-scenarios/scripts/`: 기억 압축 도구
- `scripts/validate.mjs`, `tests/`: 저장소 계약 검증
- `docs/DESIGN.md`: 행동 수준 재설계와 압축 불변식

## 개발 검증

Node.js 20 이상과 pnpm이 필요합니다.

```text
pnpm install --frozen-lockfile
pnpm run check
```

Skill 구조만 확인하려면 시스템의 skill validator로 `skills/teach-grounded-scenarios`를 검사합니다.

## 첫 예시 수업

초등학교 6학년 사회 수업을 위한 반사실 시나리오입니다. 1945년 미국의 핵무기 개발이 실패하여 히로시마와 나가사키에 원자폭탄이 투하되지 않았다는 한 가지 분기점에서 시작합니다. 학생은 일제 강점기 조선의 평범한 조선인 A가 되어 제한된 정보와 생활 조건 속에서 사실을 확인하고 판단합니다.

이 설정은 “원자폭탄이 없었다면 일본은 반드시 특정 날짜에 항복했거나 항복하지 않았을 것”이라고 결론 내리지 않습니다. 포츠담 선언, 소련의 대일전 참전, 재래식 전쟁, 일본 지도부의 판단, 한국인의 독립운동을 별도 요인으로 살핍니다.

## 라이선스와 고지

프로젝트는 Apache License 2.0에 따라 배포됩니다. 전체 조건은 `LICENSE`, 원 프로젝트와 수정 사항의 고지는 `NOTICE`를 확인하세요.

참고 원본: https://github.com/lemos999/Singulari-Tea-Codex-Prompt-for-Gemini
