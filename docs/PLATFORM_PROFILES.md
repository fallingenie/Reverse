# 공개 문서 기반 실행 프로파일

확인 기준일은 2026-08-13이다. 제품명과 모델은 수시로 바뀔 수 있으므로 화면에 보이는 모델 별칭을 신뢰 근거로 사용하지 않는다. 공개 문서가 보장하지 않는 기능은 프로파일에서도 보장하지 않는다.

| 프로파일 | 실제 보장 수준 | 허용 | 금지 또는 미보장 |
|---|---|---|---|
| `CHATGPT_FREE` | `PROMPT_GUARDED` | 첫 메시지용 지침 팩, Context Pack 읽기, 수업 진행, T2/T3 후보 작성 | 특정 모델 강제·검증, 자동 영구 저장, T0/T1 확정, 독립 감사 주장 |
| `COPILOT_M365` | `PLATFORM_CONFIGURED` | 선언형 에이전트의 기본 응답 모드를 `Think deeper`로 요청, 웹 조사, Context Pack 읽기 | 내부 모델 버전 보장, 사용자 모드 변경 차단, `@mention` 호출에서 기본 모드 보장, T0/T1 확정 |
| `WINDOWS_STANDALONE` | `HOST_ENFORCED` | 해시 연결 원장, 권한 검사, T0/T1 커밋, 텍스트 PDF 추출, Context Pack 생성 | LLM 자체 생성, 스캔 PDF OCR, 저작권 상태 자동 판정 |

## ChatGPT Free

이 배포물은 설치형 Add-on이 아니다. 무료 계정의 새 대화 첫 메시지로 붙여 넣는 지침 팩이다. 서비스가 공유 GPT나 파일 업로드를 제공하더라도 Reverse는 해당 기능의 가용성, 한도, 특정 모델을 런타임에서 확인할 수 없다. 따라서 영구 Canon은 Windows 호스트가 만든 Context Pack으로만 전달한다.

OpenAI 공개 문서에서 이 프로젝트가 요구하는 “특정 무료 모델 강제”, “모델 신원 증명”, “Canon 쓰기 잠금” 계약은 확인하지 못했다. 이 부재 자체를 권한 제한의 근거로 사용한다.

## Microsoft 365 Copilot

Microsoft 365 Copilot Chat의 공개 문서는 `Auto`, `Quick response`, `Think deeper`를 설명한다. 선언형 에이전트 스키마 v1.8은 `behavior_overrides.default_response_mode`에 `Think deeper`를 지정할 수 있지만, 사용자가 모델 선택기에서 바꿀 수 있고 메인 Copilot의 `@mention` 호출에는 기본값이 적용되지 않는 알려진 문제가 있다고 명시한다.

따라서 `copilot/declarativeAgent.json`은 `Think deeper`를 기본값으로 요청하지만 이를 강제로 표현하지 않는다. 사용자가 본 `5.6 Think Deeper`, `5.6 Quick Response`, `5.5 Quick Response` 표기는 기록할 수 있으나, 공개 문서가 내부 모델 매핑을 보장하지 않으므로 권한 판정에는 사용하지 않는다.

## Windows 독립 실행

Windows 배포물만 `HOST_ENFORCED`다. Python 코드가 원장 해시, 이벤트 순서, 권한, PDF 해시, Context Pack 입력 폐쇄성을 직접 검사한다. 생성형 응답은 수동 브리지 또는 별도 API 백엔드의 후보일 뿐이며 검증과 커밋을 통과하기 전 Canon이 아니다.

## 공개 근거

- Microsoft 365 Copilot Chat 모델 선택: https://learn.microsoft.com/en-us/copilot/overview
- Microsoft 365 선언형 에이전트 스키마 v1.8: https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8
- Copilot Studio 모델 선택과 fallback: https://learn.microsoft.com/en-us/microsoft-copilot-studio/authoring-select-agent-model
- Python 지원 버전: https://devguide.python.org/versions/
- PyInstaller onedir/onefile 사용법: https://pyinstaller.org/en/stable/usage.html
- pypdf 텍스트 추출 범위: https://pypdf.readthedocs.io/en/stable/user/extract-text.html

OpenAI 제품 제한은 공개 문서가 제공하는 범위 안에서만 적용하며, 문서로 확인되지 않은 모델 별칭을 이 저장소가 대신 보증하지 않는다.
