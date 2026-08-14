# 실행 프로파일과 권한

## 권한 표

| 프로파일 | 보장 수준 | T0/T1 읽기 | T0/T1 제안 | T0/T1 커밋 | 로컬 영구 저장 |
|---|---|---:|---:|---:|---:|
| `CHATGPT_FREE` | `PROMPT_GUARDED` | 가능 | 후보만 | 불가 | 불가 |
| `COPILOT_M365` | `PLATFORM_CONFIGURED` | 가능 | 후보만 | 불가 | 불가 |
| `WINDOWS_STANDALONE` | `HOST_ENFORCED` | 가능 | 가능 | 권한·승인 검사 뒤 가능 | 가능 |

공개 문서와 화면에 표시된 모델명은 실행 환경 기록에 남길 수 있지만 신원 증명이 아니다. 모델명이 기대와 같아 보여도 권한을 올리지 않는다.

## ChatGPT Free

접근 권한이 있는 공유 Custom GPT를 기본으로 사용하고 첫 메시지용 지침 팩을 fallback으로 제공한다. 2026-08-14 공개 문서의 Free 기본 모델은 GPT-5.6 Luna지만 이 Skill은 모델 신원, 추론량, 변경되는 한도, 압축 이후 기억, Canon 쓰기 잠금을 강제하지 못한다. Custom GPT는 이전 대화를 사용하지 않으므로 새 대화에는 필요한 Context Pack을 다시 제공한다. Context Pack의 T0/T1은 읽기 전용이다.

현재 개인 Free·Go·Plus·Pro 계정은 새 GPT를 만들거나 게시할 수 없다. 교사별 파생 GPT는 권한이 허용된 관리형 작업공간 또는 별도 지침 팩 포크로 제한한다.

## Microsoft 365 Copilot

선언형 에이전트는 `Think deeper`를 기본값으로 요청할 수 있다. 사용자가 바꿀 수 있고 `@mention` 호출에 기본값이 적용되지 않을 수 있다. fallback이나 내부 모델 버전을 이 Skill이 확인할 수 없으므로 T0/T1 커밋 권한은 없다.

## Windows

원장, 해시, 권한, PDF, Context Pack을 로컬 코드로 검증한다. LLM은 포함하지 않는다. 외부 모델의 출력은 후보이며 호스트 검증 전에는 Canon이 아니다.
