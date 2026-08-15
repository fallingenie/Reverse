# 공개 문서 기반 실행 프로파일

확인 기준일은 2026-08-14이다. 제품명과 모델은 수시로 바뀔 수 있으므로 공개 문서의 확인일과 실제 계정 화면을 함께 기록한다. 화면에 보이는 모델 별칭만으로 모델 신원이나 권한을 올리지 않으며 공개 문서가 보장하지 않는 기능은 프로파일에서도 보장하지 않는다.

| 프로파일 | 실제 보장 수준 | 허용 | 금지 또는 미보장 |
|---|---|---|---|
| `CHATGPT_FREE` | `PROMPT_GUARDED` | 접근 권한이 있는 공유 Custom GPT 사용, 지침 팩 fallback, Context Pack 읽기, 수업 진행, T2/T3 후보 작성 | 권장·기본 모델 고정 또는 신원 검증, 자동 영구 저장, T0/T1 확정, 개인 계정의 교사별 신규 GPT 생성 보장 |
| `COPILOT_M365` | `PLATFORM_CONFIGURED` | 선언형 에이전트의 기본 응답 모드를 `Think deeper`로 요청, 웹 조사, Context Pack 읽기 | 내부 모델 버전 보장, 사용자 모드 변경 차단, `@mention` 호출에서 기본 모드 보장, T0/T1 확정 |
| `WINDOWS_STANDALONE` | `HOST_ENFORCED` | 해시 연결 원장, 권한 검사, T0/T1 커밋, 텍스트 PDF 추출, Context Pack 생성 | LLM 자체 생성, 스캔 PDF OCR, 저작권 상태 자동 판정 |

## ChatGPT Free

기본 배포물은 ChatGPT 안에서 여는 공유 Custom GPT이고, 첫 메시지용 지침 팩은 접근할 수 없을 때의 fallback이다. 2026-08-14 OpenAI Free FAQ는 Free 사용자가 GPT-5.6 Luna, 파일 업로드와 접근 권한이 있는 GPT를 사용할 수 있다고 설명한다. 하지만 기본 모델과 한도는 바뀔 수 있고 GPT 사용 한도에 도달하면 초기화 시점까지 GPT 접근이 중지될 수 있다.

GPT 구성 문서는 권장 모델이 사용 불가 시 대체될 수 있고 사용자가 다른 모델을 선택할 수 있다고 설명한다. 따라서 공개된 Luna 기본값은 프로파일에 날짜와 함께 기록하되 “Luna 강제”나 모델 신원 증명으로 승격하지 않는다. GPT는 저장된 메모리, 개인 사용자 지정 지침, 이전 대화를 사용하지 않으므로 새 대화의 Canon은 별도 Context Pack으로 다시 제공한다.

현재 개인 Free·Go·Plus·Pro 계정은 새 GPT를 만들거나 게시할 수 없다. 기존 GPT는 계속 사용할 수 있고 권한 조건에 따라 편집할 수 있다. 그러므로 교사별 파생 GPT 제작은 권한이 허용된 Business·Enterprise·Edu 작업공간 또는 별도 지침 팩 포크로만 설계해야 한다.

## Microsoft 365 Copilot

Microsoft 365 Copilot Chat의 공개 문서는 `Auto`, `Quick response`, `Think deeper`를 설명한다. 선언형 에이전트 스키마 v1.8은 `behavior_overrides.default_response_mode`에 `Think deeper`를 지정할 수 있지만, 사용자가 모델 선택기에서 바꿀 수 있고 메인 Copilot의 `@mention` 호출에는 기본값이 적용되지 않는 알려진 문제가 있다고 명시한다.

따라서 `copilot/declarativeAgent.json`은 `Think deeper`를 기본값으로 요청하지만 이를 강제로 표현하지 않는다. 사용자가 본 `5.6 Think Deeper`, `5.6 Quick Response`, `5.5 Quick Response` 표기는 기록할 수 있으나, 공개 문서가 내부 모델 매핑을 보장하지 않으므로 권한 판정에는 사용하지 않는다.

## Windows 독립 실행

Windows 배포물만 `HOST_ENFORCED`다. Python 코드가 원장 해시, 이벤트 순서, 권한, PDF 해시, Context Pack 입력 폐쇄성을 직접 검사한다. 생성형 응답은 수동 브리지 또는 별도 API 백엔드의 후보일 뿐이며 검증과 커밋을 통과하기 전 Canon이 아니다.

## 공개 근거

- ChatGPT Free의 현재 모델·GPT·한도: https://help.openai.com/en/articles/9275245-chatgpt-free-tier-faq
- GPT 접근·기억·개인정보 경계: https://help.openai.com/en/articles/8554407-gpts-in-chatgpt
- GPT 생성·권장 모델·대체 동작: https://help.openai.com/en/articles/8554397-creating-a-gpt
- Microsoft 365 Copilot Chat 모델 선택: https://learn.microsoft.com/en-us/copilot/overview
- Microsoft 365 선언형 에이전트 스키마 v1.8: https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8
- Copilot Studio 모델 선택과 fallback: https://learn.microsoft.com/en-us/microsoft-copilot-studio/authoring-select-agent-model
- Python 지원 버전: https://devguide.python.org/versions/
- PyInstaller onedir/onefile 사용법: https://pyinstaller.org/en/stable/usage.html
- pypdf 텍스트 추출 범위: https://pypdf.readthedocs.io/en/stable/user/extract-text.html

OpenAI 제품 제한은 공개 문서가 제공하는 범위 안에서만 적용한다. 공개된 기본 모델 이름도 변경 가능한 시점 정보이며 이 저장소가 내부 모델 신원이나 지속 가용성을 대신 보증하지 않는다.
