# 로컬 자체증명 요약

검증 시각: 2026-08-15 06:32 KST
검증 대상: ChatGPT·Microsoft 365 Copilot 활성 범위
제외 대상: Windows 독립 실행본

## 판정

`PASS_LOCAL_ONLY` — **LOCAL SELF-ATTESTATION — NOT CI**

이 문서는 GitHub 원격 브랜치와 일치하는 정확한 커밋을 별도의 깨끗한 detached checkout에서 로컬로 재현한 결과다. GitHub Actions 통과 증거가 아니며 실제 Microsoft 365 테넌트 실행 또는 ChatGPT Free 실행을 증명하지 않는다.

## 대상 동일성

- source commit: `95db412a27e744ed6a72540ab572829aff998f5c`
- tree: `d22e983239d28cefb82923f50e94e08b2adebf1f`
- remote ref: `refs/heads/agent/runtime-profiles`
- 원격 SHA 일치: 예
- 자체증명 생성기가 대상 커밋에 포함됨: 예

## 검증 결과

- 계획된 활성 명령: 9/9 종료값 0
- Node 회귀시험: 85/85 통과
- Microsoft 365 Agents Toolkit: 59/59 통과
- 알려진 pnpm 의존성 취약점: 0
- 깨끗한 checkout: 시작·종료 모두 변경 없음
- Windows 원본 디렉터리: 검증 전후 동일
- 원본 작업 트리의 보류 Windows 항목: 13개를 정확히 기록
- 임시 checkout: 안전한 OS 임시 경로에서 제거 완료
- 증거 묶음 체크섬: 20/20 일치
- 비밀값 및 일반·JSON 이스케이프 사용자 절대경로 재검사: 탐지 0

## 산출물

- ChatGPT export seal: `3499db1f850c67c8a8f4e53a466394bfa9868293a594c1481c7d21c8f0ea7da6`
- Copilot export seal: `add22a6ebc416856afd276fcd6a7fe8ed3ed9611642efe300e9a4d29283214d3`
- Copilot ZIP: 41,624 bytes
- Copilot ZIP SHA-256: `bf01129c2c6845343c848f0cb2775cc03f53d82d76b0df3c9a895c78942e6618`

전체 증거 묶음은 로컬의 `.reverse-local/local-self-attestation/95db412a27e7-20260814T213203757Z/`에 보존했다. 원문 로그는 로컬 사용자 경로와 환경 세부정보를 공개 이력에 불필요하게 남기지 않기 위해 Git에 커밋하지 않았다.

## 원격 CI 경계

GitHub Actions run `31842805093`, job `94903098104`는 대상 SHA와 일치하지만 `runner_id=0`, `steps=[]` 상태에서 끝났다. GitHub가 기록한 사유는 최근 계정 결제 실패 또는 spending limit 확인 필요다. 따라서 이는 코드 시험 실패가 아니라 **러너 시작 전 외부 차단**이며, 동시에 CI 통과도 아니다.

## 남은 외부 검증

- ChatGPT Free/Luna 계정에서의 실제 실행
- RT-01~149 전체 라이브 실행과 장기 다중 턴 회귀
- Microsoft 365 Enterprise/Education 테넌트의 사용자 지정 앱 업로드 정책 해소 뒤 실제 실행
- 초보 교사 최소 3명의 독립 설치·편집 관찰
- 역사·과학·교과교육·개인정보·연구윤리 외부 검토
