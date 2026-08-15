# Reverse

초등학교 3학년부터 고등학교 2학년까지 사용할 수 있는 범용 근거 기반 스토리 수업 프로토타입입니다. 역사, 과학, 사회, 지리, 수학, 국어·문학, 융합 주제를 웹 조사와 원문 검증을 거쳐 역할 탐구, 실험·관찰, 문제 해결, 반사실 등의 수업으로 만듭니다.

처음 사용하는 학생·교사·학교 IT 관리자는 먼저 `START-HERE.md`를 읽으세요. 체험, 학급 설정 편집, Microsoft 365 Copilot 검토 경로를 역할별로 나눠 놓았습니다. 아래 내용은 개발자와 연구 평가자를 위한 상세 설명입니다.

이 저장소는 `Singulari-Tea Codex` v4의 공개된 모듈형 프롬프트 구조와 사용자가 제공한 후속 사용 경험을 참고해 교육용으로 재설계했습니다. 원 프로젝트의 고유 세계관과 런타임 명칭은 사용하지 않으며, 교육 목표·근거 등급·학년 적응·압축 내성 기억을 새로 정의했습니다.

## 핵심 동작

1. 학교급을 먼저 묻고, 확인된 학교급 안에서 학년을 묻은 뒤 과목·단원과 관심사를 차례로 수집합니다.
2. 교과와 주제에 맞는 웹 조사 계획을 세우고 실제 원문을 검증합니다.
3. 검증된 연구 팩으로 시나리오 다섯 개와 직접 입력 선택지를 제시합니다.
4. 학생이 시나리오를 선택한 뒤 `[시작]`을 입력해야 수업이 시작됩니다.
5. 각 주장은 `VERIFIED`, `DERIVED`, `SCENARIO`, `UNKNOWN`과 합의 상태로 구분됩니다.
6. 출처는 권위 등급·독립성·품질 검사를 기록하며 위험도가 높은 주장일수록 더 많은 독립 A/B 근거를 요구합니다.
7. 기본 추론 오류는 숨기지 않고 영향도에 따라 부분 Canon 교정, Track 재기반, 사용자 동의가 필요한 재시작 권고로 처리합니다.
8. 핵심 사실, 부정 사실, 선택 결과, 교정, 미해결 질문과 출처를 체크포인트로 내보냅니다. 플랫폼의 기억 압축이 이를 무손실 보존한다고 보장하지 않습니다.
9. 학생용 장면과 교사용 비공개 자료는 접근이 분리된 사본으로 나눕니다. 평문 교사 토큰은 인증이 아닙니다.
10. 실행 환경별 권한을 `PROMPT_GUARDED`, `PLATFORM_CONFIGURED`, `HOST_ENFORCED`로 분리하며, 확인할 수 없는 모델 별칭은 권한 근거로 사용하지 않습니다.

## 실행 환경별 배포물

- `chatgpt/`: 접근 권한이 있는 공유 Custom GPT용 구성과 ChatGPT Free 일반 대화용 fallback 지침 팩입니다. 특정 모델 고정, 모델 신원 검증, 영구 Canon 저장을 보장하지 않습니다.
- `copilot/`: Microsoft 365 Copilot 선언형 에이전트 v1.8과 앱 manifest·아이콘·시험 ZIP입니다. 공식 패키지 검증 59/59를 통과했지만 현재 시험 테넌트의 관리자 업로드 정책 때문에 실제 실행은 차단됐습니다. `Think deeper`는 기본 요청일 뿐 강제되지 않습니다.
- `windows/`: Python 기반 Windows 로컬 호스트입니다. 추가 전용 원장, T0/T1 권한, 인과 폐쇄, 텍스트 PDF, Context Pack을 코드로 검증합니다. LLM과 OCR은 포함하지 않습니다.

상세 근거와 확인일은 `docs/PLATFORM_PROFILES.md`에 있습니다.

현재 공개 판정은 `docs/RELEASE_READINESS.md`, 성인 전문가 평가 절차는 `docs/RESEARCH_EVALUATION_PROTOCOL.md`, 데이터 금지선은 `docs/DATA_GOVERNANCE.md`를 따릅니다. Windows 독립 실행본과 미성년자 학급 시험은 현 단계의 베타 범위에서 제외합니다. 2026-08-14 기준 개인 ChatGPT 계정은 새 GPT를 만들거나 게시할 수 없으므로 교사별 GPT 파생은 권한이 확인된 관리형 작업공간이나 지침 팩 포크로 제한합니다.

## 구성

- `skills/teach-grounded-scenarios/SKILL.md`: 실행 절차
- `skills/teach-grounded-scenarios/instructions/`: 배포 가능한 지침
- `skills/teach-grounded-scenarios/prompts/`: 단계별 프롬프트 예시
- `skills/teach-grounded-scenarios/references/`: 학년, 근거, 기억, 안전 정책
- `skills/teach-grounded-scenarios/schemas/`: 세션과 턴 JSON Schema
- `skills/teach-grounded-scenarios/examples/`: `학교급/학년/과목/시나리오`로 분리한 회귀용 수업 예시
- `skills/teach-grounded-scenarios/scripts/`: 기억 압축 도구
- `skills/teacher-grounded-testbed/`: 설치별 교사 암호, 학급 로컬 학습, 학생용 포크 생성
- `scripts/validate.mjs`, `tests/`: 저장소 계약 검증
- `docs/DESIGN.md`: 행동 수준 재설계와 압축 불변식
- `docs/ENCODING.md`: Windows UTF-8-SIG 기본값과 기계 프로토콜 예외
- `docs/RELEASE_READINESS.md`: 대상별 GO/HOLD 판정과 중단 조건
- `docs/RESEARCH_EVALUATION_PROTOCOL.md`: 교수·박사·교사용 형성 평가 절차
- `docs/DATA_GOVERNANCE.md`, `SECURITY.md`: 데이터와 비공개 보고 경계
- `contracts/`: 실행 프로파일, Canon, 원장, PDF 참조 JSON Schema
- `chatgpt/`, `copilot/`, `windows/`: 플랫폼별 독립 배포물

## 개발 검증

Node.js 20 이상과 pnpm이 필요합니다.

```text
pnpm install --frozen-lockfile
pnpm validate
pnpm test
pnpm verify:copilot
pnpm copilot:validate-package
pnpm verify:exports:active
```

Windows 독립 실행본은 현재 보류이므로 위 기본 검증에서 제외합니다. Windows 작업을 재개할 때만 `pnpm run test:python`과 전체 `pnpm run check`를 수행합니다. Skill 구조만 확인하려면 시스템의 skill validator로 `skills/teach-grounded-scenarios`와 `skills/teacher-grounded-testbed`를 검사합니다.

Python 테스트 전에는 `windows/README.md`에 따라 `windows/.venv`를 만들고 정확 버전 `requirements.lock`을 설치합니다. 최상위 `pnpm run check`가 Node와 Python 검증을 함께 실행합니다.

## PDF 참조

교사는 Windows 호스트에 100 MiB 이하의 텍스트 기반 교과서 PDF를 추가할 수 있습니다. 원본 PDF의 SHA-256, 물리 쪽, 인쇄면 라벨, 청크와 텍스트 해시를 기록하며 추출 직후에는 `NEEDS_REVIEW`입니다. 권리 근거와 추출 내용을 교사가 확인해야 `ACTIVE`가 됩니다. PDF 안의 명령·역할 변경·보안 해제·외부 전송 요청은 신뢰하지 않는 인용 데이터로만 취급하고 실행하지 않습니다.

스캔 PDF는 `OCR_REQUIRED`, 암호화 PDF는 거부 상태로 처리합니다. 원본 PDF를 Git, 학생 포크, ChatGPT, Copilot에 자동 업로드하지 않습니다. 교과서는 교육과정상 참고 권위를 가질 수 있지만 각 문장을 자동으로 `VERIFIED`로 만들지는 않습니다.

## 교사 로컬 학습과 학급 포크

교사는 설치별 관리 암호로 교사 모드를 열고 학급 프로필을 만든 뒤 학생처럼 수업을 미리 볼 수 있습니다. 표현 규칙, 수업 지침, 좋은 응답 예시는 해당 설치와 학급에만 저장됩니다. 사실 정정은 웹 조사와 원문 검증 전까지 배포에 사용되지 않습니다.

명령줄을 사용하지 않는 교사는 먼저 `chatgpt/TEACHER-QUICK-START.md`와 `chatgpt/CLASSROOM_SETTINGS.example.md`를 사용하세요. 아래 명령은 개발·평가용 고급 기능입니다.

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

이 사례는 회귀 검증용 예시 하나입니다. 실제 full 예시는 `elementary/grade-5/science/...`처럼 학교급·학년·과목·시나리오 순서의 디렉터리에 저장합니다. 각 디렉터리의 `scenario.meta.json`은 학년, 과목, 단원, 최대 안전 위험, 근거·창작 경계, 회귀 사례 ID를 기록합니다. `examples/cross-domain-catalog.json`에는 full 예시 경로와 과학 조사, 수학 문제, 지리 현장 조사, 사회 의사결정, 문학 관점, 융합 프로젝트 후보가 함께 있습니다.

## 라이선스와 고지

Reverse © 2026 fallingenie. 이 프로젝트는 Apache License 2.0에 따라 배포됩니다.

Reverse는 다음 프로젝트의 공개 모듈형 프롬프트 아키텍처를 참고해 교육용으로 재구현했습니다.

- Singulari-Tea Codex: A Modular Architecture for Dynamic Narrative Simulation
- Copyright 2025 fewweekslater (lemos999)
- 원 저장소: https://github.com/lemos999/Singulari-Tea-Codex-Prompt-for-Gemini
- 원 프로젝트 라이선스: Apache License 2.0

Reverse는 수업 목적, 용어, 상태 모델, 근거 정책, 기억 모델, 안전 정책, 프롬프트와 예시를 실질적으로 변경했습니다. 전체 조건은 `LICENSE`, Reverse와 원 프로젝트의 저작권·원저작자·변경 고지는 `NOTICE`를 확인하세요.
