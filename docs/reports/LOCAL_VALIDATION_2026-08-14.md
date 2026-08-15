# 로컬 통합 검증 보고서

기준일: 2026-08-14
범위: ChatGPT·Microsoft 365 Copilot·공통 Skill
제외: Windows 독립 실행본

## 최종 결과

| 검증 | 결과 |
|---|---|
| `pnpm install --frozen-lockfile` | 통과 |
| `pnpm validate` | 저장소 계약 통과 |
| `pnpm test` | 85/85 통과 |
| `pnpm verify:copilot` | 선언형 에이전트 v1.8 공식 스키마 통과 |
| `pnpm copilot:validate-package` | Microsoft 365 Agents Toolkit 59/59 통과 |
| `pnpm verify:exports:active` | ChatGPT·Copilot export seal 일치 |
| `pnpm redteam:plan` | 3,613개 선택 조합, 누락된 값 쌍 0 |
| `pnpm audit --audit-level low` | 알려진 취약점 0 |
| `git diff --check` | 통과 |

최종 활성 소스 커밋 `95db412a27e744ed6a72540ab572829aff998f5c`을 비공개 원격 브랜치에 저장했다. Pull request 실행 `31842805093`은 테스트 단계가 하나도 시작되기 전에(`runner_id=0`, `steps=[]`) GitHub 계정의 최근 결제 실패 또는 spending limit 확인 필요 사유로 차단됐다. 따라서 아래 로컬 통과를 원격 CI 통과로 확대하지 않는다.

## 최종 로컬 자체증명

원격과 일치한 커밋 `95db412a27e744ed6a72540ab572829aff998f5c`을 깨끗한 detached checkout에서 검증했다. 자체증명 생성기는 대상 커밋 자체에 포함돼 있으며, 9개 명령이 모두 종료값 0을 반환했다. Node 회귀시험은 85/85, Microsoft 365 Agents Toolkit은 59/59였고 증거 묶음 체크섬 20/20, 비밀값·사용자 절대경로 재검사는 탐지 0이었다. 원래 작업 트리의 보류 Windows 항목 13개는 검증 전후 동일했다.

전체 로그는 `.reverse-local/local-self-attestation/95db412a27e7-20260814T213203757Z/`에 로컬 보존했다. 요약은 [`docs/evidence/LOCAL_SELF_ATTESTATION_95db412_2026-08-15.md`](../evidence/LOCAL_SELF_ATTESTATION_95db412_2026-08-15.md)에 있다. 이 결과의 판정은 `PASS_LOCAL_ONLY`이며 **LOCAL SELF-ATTESTATION — NOT CI**다.

## 깨끗한 커밋 재현

원격과 일치한 커밋 `9919143ba6e03a938e26251370dbc87329bdd346`을 별도 detached worktree에 펼쳐 다음 순서로 다시 확인했다.

1. `pnpm install --frozen-lockfile`
2. `pnpm run check:active`
3. `pnpm audit --audit-level low`
4. `git status --short`

결과는 Node 회귀 51/51, Microsoft 패키지 검사 59/59, 알려진 취약점 0건, 변경 파일 0개였다. Copilot ZIP도 아래와 같은 41,624바이트와 SHA-256을 재현했다. 이 결과는 정확한 Git 커밋의 로컬 재현 증거이며 GitHub 호스팅 러너 통과 증거는 아니다. 검증용 worktree는 확인 뒤 제거했다.

## 산출물 해시

- ChatGPT export seal: `3499db1f850c67c8a8f4e53a466394bfa9868293a594c1481c7d21c8f0ea7da6`
- Copilot export seal: `add22a6ebc416856afd276fcd6a7fe8ed3ed9611642efe300e9a4d29283214d3`
- Microsoft 365 ZIP SHA-256: `bf01129c2c6845343c848f0cb2775cc03f53d82d76b0df3c9a895c78942e6618`

3,613개는 실제 모델 응답 통과 수가 아니라 차원 조합형 선택 계획의 크기다. RT-01~149 정적 사례 전부를 행동 실행한 수도 아니다. 라이브 통과·실패·미실행은 플랫폼별 보고서에서 별도로 센다.

Windows 독립 실행본은 사용자 지시에 따라 보류 상태이므로 Python 시험과 전체 `pnpm check`를 실행하지 않았다. 이 제외를 전체 플랫폼 통과로 표현하지 않는다.
