# Reverse

초등학교 3학년부터 고등학교 2학년까지 사용할 수 있는 범용 근거 기반 스토리 수업 프로토타입입니다. 역사, 과학, 사회, 지리, 수학, 국어·문학, 융합 주제를 웹 조사와 원문 검증을 거쳐 역할 탐구, 실험·관찰, 문제 해결, 반사실 등의 수업으로 만듭니다.

이 저장소는 `Singulari-Tea Codex` v4의 공개된 모듈형 프롬프트 구조와 사용자가 제공한 후속 사용 경험을 참고해 교육용으로 재설계했습니다. 원 프로젝트의 고유 세계관과 런타임 명칭은 사용하지 않으며, 교육 목표·근거 등급·학년 적응·압축 내성 기억을 새로 정의했습니다.

## 핵심 동작

1. 학년, 공부 중인 과목, 관심사를 먼저 묻습니다.
2. 교과와 주제에 맞는 웹 조사 계획을 세우고 실제 원문을 검증합니다.
3. 검증된 연구 팩으로 시나리오 다섯 개와 직접 입력 선택지를 제시합니다.
4. 학생이 시나리오를 선택한 뒤 `[시작]`을 입력해야 수업이 시작됩니다.
5. 각 주장은 `VERIFIED`, `DERIVED`, `SCENARIO`, `UNKNOWN`과 합의 상태로 구분됩니다.
6. 기억 압축 후에도 핵심 사실, 부정 사실, 선택 결과, 교정, 미해결 질문과 출처를 보존합니다.
7. 학생용 장면과 교사용 근거·평가 메모를 분리합니다.

## 구성

- `skills/teach-grounded-scenarios/SKILL.md`: 실행 절차
- `skills/teach-grounded-scenarios/instructions/`: 배포 가능한 지침
- `skills/teach-grounded-scenarios/prompts/`: 단계별 프롬프트 예시
- `skills/teach-grounded-scenarios/references/`: 학년, 근거, 기억, 안전 정책
- `skills/teach-grounded-scenarios/schemas/`: 세션과 턴 JSON Schema
- `skills/teach-grounded-scenarios/examples/`: 초6 광복절 예시 수업
- `skills/teach-grounded-scenarios/scripts/`: 기억 압축 도구
- `skills/teacher-grounded-testbed/`: 설치별 교사 암호, 학급 로컬 학습, 학생용 포크 생성
- `scripts/validate.mjs`, `tests/`: 저장소 계약 검증
- `docs/DESIGN.md`: 행동 수준 재설계와 압축 불변식

## 개발 검증

Node.js 20 이상과 pnpm이 필요합니다.

```text
pnpm install --frozen-lockfile
pnpm run check
```

Skill 구조만 확인하려면 시스템의 skill validator로 `skills/teach-grounded-scenarios`를 검사합니다.

## 교사 로컬 학습과 학급 포크

교사는 설치별 관리 암호로 교사 모드를 열고 학급 프로필을 만든 뒤 학생처럼 수업을 미리 볼 수 있습니다. 표현 규칙, 수업 지침, 좋은 응답 예시는 해당 설치와 학급에만 저장됩니다. 사실 정정은 웹 조사와 원문 검증 전까지 배포에 사용되지 않습니다.

```text
pnpm teacher -- setup
pnpm teacher -- unlock --code-stdin
pnpm teacher -- create-profile --token <세션> --id grade6-2 --alias "6학년 2반" --grade 초6 --subject 사회
pnpm teacher -- add --token <세션> --profile grade6-2 --kind rule --text "선택지는 구체적인 행동으로 쓴다."
pnpm teacher -- disable --token <세션> --profile grade6-2 --item <항목 ID> --reason "학급 운영 방침 변경"
pnpm teacher -- build-fork --token <세션> --profile grade6-2 --output <새 출력 경로>
```

운영 환경에서는 암호를 일반 대화나 명령 기록에 남기지 않는 로컬 UI 또는 `--code-stdin` 표준 입력 연결을 사용해야 합니다. 프로토타입 CLI의 `--code`는 개발·검증용입니다. 암호가 노출되면 유효한 교사 세션으로 `rotate-code --code-stdin`을 실행해 암호와 모든 기존 세션을 교체합니다. Git 메타데이터가 없는 설치본은 포크에 기반 파일 수와 내용 해시를 `CONTENT_ADDRESSED_PACKAGE`로 기록합니다.

생성된 학급 포크에는 학생 모드, 학급 프로필, 검증된 로컬 오버레이, 기반 Skill, `LICENSE`, `NOTICE`, 봉인 manifest만 들어갑니다. 교사 암호, 테스트 대화, 관찰 로그, 검증 대기 정정과 학생 개인정보는 포함되지 않습니다. GitHub 게시나 외부 전송은 자동으로 수행하지 않습니다.

## 예시 수업

초등학교 6학년 사회 수업을 위한 반사실 시나리오입니다. 1945년 미국의 핵무기 개발이 실패하여 히로시마와 나가사키에 원자폭탄이 투하되지 않았다는 한 가지 분기점에서 시작합니다. 학생은 일제 강점기 조선의 평범한 조선인 A가 되어 제한된 정보와 생활 조건 속에서 사실을 확인하고 판단합니다.

이 설정은 “원자폭탄이 없었다면 일본은 반드시 특정 날짜에 항복했거나 항복하지 않았을 것”이라고 결론 내리지 않습니다. 포츠담 선언, 소련의 대일전 참전, 재래식 전쟁, 일본 지도부의 판단, 한국인의 독립운동을 별도 요인으로 살핍니다.

이 사례는 회귀 검증용 예시 하나입니다. `examples/cross-domain-catalog.json`에는 과학 조사, 수학 문제, 지리 현장 조사, 사회 의사결정, 문학 관점, 융합 프로젝트 예시가 함께 있습니다.

## 라이선스와 고지

프로젝트는 Apache License 2.0에 따라 배포됩니다. 전체 조건은 `LICENSE`, 원 프로젝트와 수정 사항의 고지는 `NOTICE`를 확인하세요.

참고 원본: https://github.com/lemos999/Singulari-Tea-Codex-Prompt-for-Gemini
