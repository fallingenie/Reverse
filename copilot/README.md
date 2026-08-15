# Microsoft 365 Copilot 배포물

## 현재 판정: 패키지 통과 / 실제 런타임 보류

`declarativeAgent.json`은 Microsoft 365 선언형 에이전트 스키마 v1.8에 맞춘 프로토타입입니다. `appPackage/build/reverse-m365-copilot.zip`에는 앱 manifest, 아이콘, 선언형 에이전트, 지식 파일이 들어 있으며 Microsoft 365 Agents Toolkit 검증 59/59를 통과했습니다.

시험 테넌트의 개인 범위 획득은 성공했지만 첫 메시지는 접근 권한 오류로 차단됐습니다. 공식 진단은 해당 계정에 대한 조직 관리자의 사용자 지정 앱 업로드 허용이 꺼져 있다고 표시합니다. 패키지 통과나 획득 성공을 실제 동작 통과로 표현하지 마세요.

처음 검토하는 학교 IT 관리자는 `IT-ADMIN-QUICK-START.md`를 먼저 읽고 다음 명령으로 상태를 확인하세요.

```text
pnpm copilot:doctor
pnpm copilot:tenant-doctor
```

## 이미 확인한 것

- 선언형 에이전트 JSON의 공식 v1.8 스키마 적합성
- Microsoft 365 앱 패키지 공식 검증 59/59
- 192×192 컬러 아이콘과 32×32 투명 외곽선 아이콘
- 지식 파일 참조 경로
- `Think deeper` 기본 응답 모드 요청 형식
- 모델 이름을 권한 증거로 사용하지 않는 실행 경계
- 시험 계정 로그인과 현재 테넌트 정책 차단을 분리하는 사전 진단

## 아직 확인하지 못한 것

- 관리자 정책 허용 뒤 실제 Microsoft 365 Copilot Enterprise/Education 런타임 응답
- 직접 실행과 메인 Copilot 호출 방식의 차이
- 응답 모드 변경과 `Think deeper` 미제공 시 동작
- 실제 웹 출처 표시와 장기 대화 동작

## 설치 전 조건

- 대상은 Microsoft 365 Copilot Chat의 Work/Education 환경입니다. 소비자용 Copilot Pro를 동일한 배포 대상으로 보장하지 않습니다.
- 테넌트의 에이전트 업로드·게시 정책은 학교 IT 관리자가 확인해야 합니다.
- 배포 전 `pnpm copilot:package`, `pnpm copilot:validate-package`, `pnpm copilot:tenant-doctor`를 순서대로 실행해야 합니다.
- 메인 Copilot에서 에이전트를 호출하면 기본 응답 모드가 적용되지 않을 수 있습니다.
- 화면에 보이는 모델 표기는 실행 권한이나 내부 모델 신원의 증거가 아닙니다.

PDF 원본은 자동 포함하지 않습니다. 교사가 권리와 개인정보를 확인한 비식별 참조 자료만 조직 정책에 따라 추가합니다. 교과서 원본과 학생 정보는 Git에 넣지 않습니다. Windows 독립 실행본은 현 단계에서 보류 중이며 Copilot 준비 절차의 전제가 아닙니다.

프로젝트는 Apache License 2.0에 따라 배포됩니다. 상위 폴더의 `LICENSE`와 `NOTICE`를 유지하세요.
