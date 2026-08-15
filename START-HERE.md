# Reverse 빠른 시작 안내

이 문서는 코드를 모르는 교사와 학교 담당자를 위한 첫 화면입니다. 먼저 자신의 역할만 고르세요.

수업을 체험하려는 교사는 프로그램을 설치하지 않아도 됩니다. [Vercel 수업 화면](https://reverse-education-beta.vercel.app/)을 열고 안내를 따르면 됩니다. 로그인, 수업 전 확인, 학생 정보 보호, 교사 기록과 내보내기는 [Reverse 교사용 가이드](docs/TEACHER_GUIDE.md)에 단계별로 설명했습니다.

아래 명령은 저장소를 내려받고 pnpm 설치까지 끝낸 개발자·검수자만 사용합니다.

```text
pnpm start
```

이 명령은 ChatGPT 수업 자료와 Microsoft 365 Copilot 패키지를 구분해 안내합니다. 앱을 자동 설치하거나 비공개 GPT를 만들거나 조직 정책을 변경하지 않습니다. Node.js와 pnpm이 없는 교사는 설치를 시도하지 말고 공유받은 비공개 GPT 링크를 사용하거나 학교 IT 관리자에게 요청하세요.

## 지금 가능한 범위

| 사용 방식 | 바로 체험 | 교사가 직접 편집 | 현재 제한 |
|---|---:|---:|---|
| 교사가 공유한 ChatGPT GPT | 가능 | GPT 편집 권한이 있을 때만 가능 | 공유 권한과 사용 한도에 따라 달라짐 |
| ChatGPT 일반 대화 | 가능 | `CLASSROOM_SETTINGS.example.md`를 고쳐 붙여 넣는 방식으로 가능 | 설정은 새 대화에 자동 보존되지 않음 |
| Microsoft 365 Copilot | 시험 패키지 준비 | 수업 내용과 설정 파일 편집 가능 | 현재 시험 테넌트의 관리자 앱 업로드 정책이 차단 상태 |
| Windows 독립 실행 | 보류 | 보류 | 현 베타 범위가 아님 |

“가능”은 해당 서비스의 계정·조직 정책이 허용할 때를 뜻합니다. 모델 이름, 높은 추론 모드, 영구 기억을 이 프로젝트가 강제로 보장하지는 않습니다.

## 1. 학생 또는 수업 체험자

교사가 준 ChatGPT 링크가 있으면 그 링크를 여세요. 링크가 없으면 다음 순서로 체험할 수 있습니다.

1. `chatgpt/BOOTSTRAP.md`의 전체 내용을 ChatGPT 새 대화 첫 메시지로 붙여 넣습니다.
2. 에이전트가 학교급부터 물으면 차례로 답합니다.
3. 시나리오 다섯 개 중 하나를 고른 뒤 `[시작]`을 입력합니다.

수업 중 사실이 이상하면 바로 질문하세요. 에이전트는 이야기를 계속 밀어붙이지 않고 근거와 설정을 나누어 설명해야 합니다.

## 2. 교사: 내 학급에 맞게 간단히 편집

코드를 수정할 필요가 없는 가장 쉬운 방법입니다.

1. `chatgpt/CLASSROOM_SETTINGS.example.md`를 복사합니다.
2. 대괄호 안의 예시만 자신의 수업에 맞게 고칩니다. 학생 이름·학번·연락처·건강·가정 정보는 넣지 않습니다.
3. ChatGPT 일반 대화에서는 `BOOTSTRAP.md` 다음 메시지로 붙여 넣습니다.
4. GPT 편집 권한이 있는 교사는 자신의 비공개 GPT 지식 파일로 추가할 수 있습니다.
5. 첫 수업 전에 학생처럼 한 번 시험하고 사실성·학년 적합성·안전성을 확인합니다.

자세한 설명은 `chatgpt/TEACHER-QUICK-START.md`에 있습니다. 명령줄 기반 학급 포크 도구는 아직 초심자용 완성품이 아니며, 개발·평가용 고급 기능입니다.

## 3. 학교 IT 관리자: Microsoft 365 Copilot

현재 `copilot/declarativeAgent.json`과 시험용 Microsoft 365 앱 패키지가 준비되어 있습니다. 패키지 형식 검증은 실제 학교 테넌트의 동작·개인정보 정책·학생 배포 승인을 대신하지 않습니다.

1. `pnpm copilot:doctor`로 로컬 패키지를 확인하고 `pnpm copilot:tenant-doctor`로 시험 계정과 조직 정책을 확인합니다.
2. 설치할 학교·기관의 Microsoft 365 Work/Education 테넌트와 Copilot Studio 환경을 직접 확인합니다. 패키지는 특정 재단 환경 ID에 묶이지 않지만, 다른 테넌트의 시험 결과를 현재 환경의 통과 증거로 간주하면 안 됩니다.
3. `copilot/IT-ADMIN-QUICK-START.md`에서 필요한 권한과 남은 패키지 항목을 확인합니다.
4. `pnpm copilot:package`로 ZIP을 다시 만들고 `copilot/appPackage/build/reverse-m365-copilot.zip`을 관리자가 승인한 대상 테넌트에 업로드합니다.
5. 실제 Enterprise/Education 테넌트에서 직접 실행, 호출 방식, 응답 모드 변경, 웹 출처 표시를 시험합니다.

관리자 정책 허용 뒤 실제 응답 검증 전에는 “Copilot 배포 가능” 또는 “Think deeper 강제”라고 표시하지 않습니다.

## 4. 개발자와 연구 평가자

개발 검증 명령과 내부 구조는 `README.md`, 공개 판정은 `docs/RELEASE_READINESS.md`, 성인 전문가 평가는 `docs/RESEARCH_EVALUATION_PROTOCOL.md`를 확인하세요.

프로젝트는 Apache License 2.0에 따라 배포됩니다. `LICENSE`와 `NOTICE`를 함께 유지하세요.
