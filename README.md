# Reverse

초등학교 3학년부터 고등학교 2학년까지 사용할 수 있는 범용 근거 기반 스토리 수업 프로토타입입니다. 역사, 과학, 사회, 지리, 수학, 국어·문학, 융합 주제를 웹 조사와 원문 검증을 거쳐 역할 탐구, 실험·관찰, 문제 해결, 반사실 등의 수업으로 만듭니다.

이 저장소는 `Singulari-Tea Codex` v4의 공개된 모듈형 프롬프트 구조와 사용자가 제공한 후속 사용 경험을 참고해 교육용으로 재설계했습니다. 원 프로젝트의 고유 세계관과 런타임 명칭은 사용하지 않으며, 교육 목표·근거 등급·학년 적응·압축 내성 기억을 새로 정의했습니다.

## 핵심 동작

1. 학년, 공부 중인 과목, 관심사를 먼저 묻습니다.
2. 교과와 주제에 맞는 웹 조사 계획을 세우고 실제 원문을 검증합니다.
3. 검증된 연구 팩으로 시나리오 다섯 개와 직접 입력 선택지를 제시합니다.
4. 학생이 시나리오를 선택한 뒤 `[시작]`을 입력해야 수업이 시작됩니다.
5. 각 주장은 `VERIFIED`, `DERIVED`, `SCENARIO`, `UNKNOWN`과 합의 상태로 구분됩니다.
6. 출처는 권위 등급·독립성·품질 검사를 기록하며 위험도가 높은 주장일수록 더 많은 독립 A/B 근거를 요구합니다.
7. 기본 추론 오류는 숨기지 않고 영향도에 따라 부분 Canon 교정, Track 재기반, 사용자 동의가 필요한 재시작 권고로 처리합니다.
8. 기억 압축 후에도 핵심 사실, 부정 사실, 선택 결과, 교정, 미해결 질문과 출처를 보존합니다.
9. 학생용 장면과 교사용 근거·평가 메모를 분리합니다.
10. 실행 환경별 권한을 `PROMPT_GUARDED`, `PLATFORM_CONFIGURED`, `HOST_ENFORCED`로 분리하며, 확인할 수 없는 모델 별칭은 권한 근거로 사용하지 않습니다.

## 실행 환경별 배포물

- `chatgpt/`: ChatGPT Free 새 대화 첫 메시지용 지침 팩입니다. 설치형 Add-on, 특정 모델 강제, 영구 Canon 저장을 보장하지 않습니다.
- `copilot/`: Microsoft 365 Copilot 선언형 에이전트 v1.8 초안입니다. `Think deeper`를 기본 응답 모드로 요청하지만 사용자가 바꿀 수 있고 내부 모델 버전을 증명하지 않습니다.
- `windows/`: Python 기반 Windows 로컬 호스트입니다. 추가 전용 원장, T0/T1 권한, 인과 폐쇄, 텍스트 PDF, Context Pack을 코드로 검증합니다. LLM과 OCR은 포함하지 않습니다.

상세 근거와 확인일은 `docs/PLATFORM_PROFILES.md`에 있습니다.

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
- `docs/ENCODING.md`: Windows UTF-8-SIG 기본값과 기계 프로토콜 예외
- `contracts/`: 실행 프로파일, Canon, 원장, PDF 참조 JSON Schema
- `chatgpt/`, `copilot/`, `windows/`: 플랫폼별 독립 배포물

## 개발 검증

Node.js 20 이상과 pnpm이 필요합니다.

```text
pnpm install --frozen-lockfile
pnpm run test:python
pnpm run check
pnpm run test:e2e -- --require-distribution-ready
```

마지막 E2E는 clean Git 커밋 또는 내용 주소 기반 설치 패키지에서 실행해야 합니다. Skill 구조만 확인하려면 시스템의 skill validator로 `skills/teach-grounded-scenarios`와 `skills/teacher-grounded-testbed`를 검사합니다.

Python 테스트 전에는 `windows/README.md`에 따라 `windows/.venv`를 만들고 정확 버전 `requirements.lock`을 설치합니다. 최상위 `pnpm run check`가 Node와 Python 검증을 함께 실행합니다.

## PDF 참조

교사는 Windows 호스트에 텍스트 기반 교과서 PDF를 추가할 수 있습니다. 원본 PDF의 SHA-256, 물리 쪽, 인쇄면 라벨, 청크와 텍스트 해시를 기록하며 추출 직후에는 `NEEDS_REVIEW`입니다. 권리 근거와 추출 내용을 교사가 확인해야 `ACTIVE`가 됩니다.

스캔 PDF는 `OCR_REQUIRED`, 암호화 PDF는 거부 상태로 처리합니다. 원본 PDF를 Git, 학생 포크, ChatGPT, Copilot에 자동 업로드하지 않습니다. 교과서는 교육과정상 참고 권위를 가질 수 있지만 각 문장을 자동으로 `VERIFIED`로 만들지는 않습니다.

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
