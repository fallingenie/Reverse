# Microsoft 365 Copilot 배포물

`declarativeAgent.json`은 Microsoft 365 선언형 에이전트 스키마 v1.8에 맞춘 프로토타입이다. `Think deeper`를 기본 응답 모드로 요청하지만 강제하지 않는다.

## 설치 전 확인

- 대상은 Microsoft 365 Copilot Chat의 Work/Education 환경이다. 소비자용 Copilot Pro를 동일한 배포 대상으로 보장하지 않는다.
- 테넌트의 에이전트 게시 권한과 정책은 관리자가 별도로 확인해야 한다.
- 배포 전 Microsoft의 현재 검증 도구로 manifest를 다시 검증해야 한다.
- 메인 Copilot에서 `@mention`으로 호출하면 기본 응답 모드가 적용되지 않을 수 있다.
- 화면에 보이는 `5.6` 또는 `5.5` 모델 표기는 실행 권한의 증거로 사용하지 않는다.

PDF는 원본을 자동 포함하지 않는다. Windows 앱에서 검토한 `reference-pack.md`를 조직 정책과 권리 확인 뒤 지식 파일로 추가한다. 교사 PDF와 학생 정보는 Git에 넣지 않는다.

프로젝트는 Apache License 2.0에 따라 배포된다. 상위 폴더의 `LICENSE`와 `NOTICE`를 유지한다.
