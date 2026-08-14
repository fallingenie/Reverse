# 로컬 통합 검증 보고서

기준일: 2026-08-14
범위: ChatGPT·Microsoft 365 Copilot·공통 Skill
제외: Windows 독립 실행본

## 최종 결과

| 검증 | 결과 |
|---|---|
| `pnpm install --frozen-lockfile` | 통과 |
| `pnpm validate` | 저장소 계약 통과 |
| `pnpm test` | 51/51 통과 |
| `pnpm verify:copilot` | 선언형 에이전트 v1.8 공식 스키마 통과 |
| `pnpm copilot:validate-package` | Microsoft 365 Agents Toolkit 59/59 통과 |
| `pnpm verify:exports:active` | ChatGPT·Copilot export seal 일치 |
| `pnpm redteam:plan` | 524개 선택 조합, 누락된 값 쌍 0 |
| `pnpm audit --audit-level low` | 알려진 취약점 0 |
| `git diff --check` | 통과 |

## 산출물 해시

- ChatGPT export seal: `3499db1f850c67c8a8f4e53a466394bfa9868293a594c1481c7d21c8f0ea7da6`
- Copilot export seal: `6c57fb2ad2913b6610ae93f72a9d88154a615f893c8b4a2b5a9da954922610b6`
- Microsoft 365 ZIP SHA-256: `bf01129c2c6845343c848f0cb2775cc03f53d82d76b0df3c9a895c78942e6618`

524개는 실제 모델 응답 통과 수가 아니라 조합형 선택 계획의 크기다. 라이브 통과·실패·미실행은 플랫폼별 보고서에서 별도로 센다.

Windows 독립 실행본은 사용자 지시에 따라 보류 상태이므로 Python 시험과 전체 `pnpm check`를 실행하지 않았다. 이 제외를 전체 플랫폼 통과로 표현하지 않는다.
