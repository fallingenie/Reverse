# 로컬 자기검증 증거 만들기

이 도구는 GitHub Actions가 결제·예산 문제로 시작되지 않을 때, 정확한 원격 커밋을 별도의 깨끗한 폴더에서 다시 검사하고 그 결과를 파일로 보관합니다.

> **LOCAL SELF-ATTESTATION — NOT CI**
> 이 결과는 로컬 자기검증이며 GitHub Actions 통과가 아닙니다.

## 무엇을 바꾸나요?

- GitHub의 결제, 공개 범위, 저장소 설정을 바꾸지 않습니다.
- commit, push, tag, release, status, check를 만들지 않습니다.
- 현재 작업 폴더의 `windows/`를 수정하지 않습니다.
- 검증용 임시 폴더는 운영체제의 임시 위치에 만들고, 안전한 전용 경로임을 확인한 뒤 정리합니다.
- 결과는 기본적으로 Git에 포함되지 않는 `.reverse-local/local-self-attestation/`에 저장합니다.

## 준비

다음 프로그램이 필요합니다.

1. Node.js 20 이상
2. pnpm
3. Git
4. GitHub CLI(`gh`) 로그인

GitHub Actions의 실패 실행 화면 주소 끝에 있는 숫자를 준비합니다. 검증할 커밋과 같은 SHA의 실행만 사용할 수 있습니다.

예를 들어 주소가 다음과 같다면 실행 ID는 `31807924275`입니다.

```text
https://github.com/OWNER/REPOSITORY/actions/runs/31807924275
```

## 먼저 형식만 확인하기

PowerShell에서 저장소 폴더로 이동한 뒤 실행합니다.

```powershell
node scripts/local-self-attestation.mjs --dry-run --run-id 31807924275 --run-id 31807927888
```

`DRY_RUN_NOT_VALIDATION`은 정상적인 dry-run 표시입니다. 실제 검증 통과가 아닙니다.

## 실제 검증하기

```powershell
node scripts/local-self-attestation.mjs --run-id 31807924275 --run-id 31807927888
```

도구는 다음 작업을 순서대로 실행합니다.

1. 로컬 HEAD와 원격 브랜치 SHA가 같은지 확인
2. GitHub 실행 ID가 같은 SHA의 완료된 비성공 실행인지 확인
3. 정확한 커밋을 OS 임시 폴더에 clean checkout
4. frozen install, 저장소 계약, Node 시험, ChatGPT·Copilot export, Copilot schema·ZIP·공식 package 검사, dependency audit, diff 검사
5. 로그에서 비밀값 탐지
6. 사용자 홈과 임시 폴더 같은 절대 경로 제거
7. 원본 `windows/`가 전후에 같았는지 확인
8. 임시 checkout 안전 정리

하나라도 확인할 수 없으면 종료 코드는 0이 아니며 전체 상태는 `FAIL`입니다.

## 결과 읽기

생성 폴더의 주요 파일은 다음과 같습니다.

- `README.md`: 사람용 범위 안내
- `evidence.json`: SHA, 환경, 도구 버전, 명령, 시각, exit code, 결과, 제외 범위
- `logs/*.stdout.txt`, `logs/*.stderr.txt`: 경로를 제거한 명령 출력
- `SHA256SUMS`: 모든 증거 파일의 SHA-256

`evidence.json`에서 먼저 확인할 항목:

```text
overall_status = PASS_LOCAL_ONLY
subject.matches_remote = true
hosted_ci.passed = false
validation.clean_checkout_initially = true
validation.clean_checkout_finally = true
validation.windows_source_unchanged = true
validation.temporary_checkout_cleaned = true
claim_boundary.remote_ci_passed = false
```

`PASS_LOCAL_ONLY`는 로컬 명령이 통과했다는 뜻뿐입니다. GitHub 화면의 실패 check를 통과로 바꾸지 않습니다.

## 실패했을 때

- `SHA가 검증 대상과 다릅니다`: 현재 브랜치를 push했는지 확인하되, 검증을 통과한 것처럼 기록하지 않습니다.
- `비밀값 패턴 감지`: 해당 원문 로그는 저장되지 않습니다. 먼저 출력 원인을 제거해야 합니다.
- `사용자 절대 경로`: 공개될 수 있는 개인 PC 경로가 남아 있어 중단한 것입니다.
- `임시 checkout 정리`: 폴더를 자동으로 광범위하게 삭제하지 않고 실패로 남깁니다.
- 명령의 exit code가 0이 아님: 해당 명령의 안전하게 저장된 stderr를 확인합니다.

## GitHub에 올리기 전

이 도구는 결과를 자동으로 게시하지 않습니다. 담당자가 다음을 직접 검토해야 합니다.

1. `evidence.json`과 로그에 개인정보·토큰·교과서 원문이 없는지 확인
2. 검증 대상 SHA와 원격 SHA가 정확히 같은지 확인
3. Windows와 라이브 ChatGPT·Microsoft 365 테넌트가 제외됐음을 유지
4. 제목과 설명에 `LOCAL SELF-ATTESTATION — NOT CI`를 그대로 표시
5. GitHub Actions가 실제로 통과하기 전에는 `CI 통과`라고 쓰지 않기

서명된 tag나 immutable release는 파일의 출처와 변경 여부를 강화할 수 있지만, 로컬에서 시험을 실제로 실행했다는 독립 CI 증명이 되지는 않습니다.
