# Windows 문자 인코딩 계약

Windows 사용자용 텍스트의 기본은 `UTF-8-SIG`다. 특히 Windows PowerShell 5는 BOM 없는 UTF-8 한국어 `.ps1`을 시스템 ANSI 코드 페이지로 오독할 수 있으므로 모든 PowerShell 스크립트는 UTF-8 BOM으로 저장한다.

## UTF-8-SIG 적용

- `.ps1`
- Windows 앱이 생성하는 사람이 읽는 Markdown Context Pack과 Reference Pack
- 사람이 직접 편집하는 Markdown·일반 텍스트의 편집기 기본값

## UTF-8 무BOM 예외

- JSON, JSONL, NDJSON, YAML
- 해시 체인의 원본 바이트
- CLI의 기계 판독용 JSON stdout
- JavaScript·TypeScript·JSX·TSX·CSS·HTML·SVG·Python·TOML·lock·spec 같은 실행·프로토콜 파일

JSON과 NDJSON에 BOM을 넣지 않는 이유는 표준 `JSON.parse`가 선행 BOM을 데이터로 취급해 실패하고, 원장 바이트 해시가 플랫폼별로 달라지는 문제를 막기 위해서다. 현재 의존 트리의 YAML 1.10.3·2.9.0과 js-yaml 4.3.1은 BOM 입력을 받아들였지만, 도구별 차이와 배포 바이트 변동을 피하려고 YAML 출력도 무BOM으로 고정한다. 입력 파일은 가능한 곳에서 선행 BOM 유무를 모두 허용한다.

`.editorconfig`가 기본값과 예외를 선언한다. `pnpm run format`은 사람이 편집하는 파일에 BOM을 정확히 하나 유지하고 기계 파일에서는 제거한다. 저장소 검증은 사람이 편집하는 Markdown·일반 텍스트와 PowerShell의 UTF-8-SIG, JSON·YAML·소스·원장·도구 제어 파일의 무BOM을 전수 검사한다. 별도 문자 무결성 검사는 잘못된 UTF-8, U+FFFD, C1 제어문자, 본문 중간 BOM, 대표적인 이중 디코딩 흔적을 발견하면 실패한다.

PowerShell 5의 `Get-Content` 기본 인코딩은 BOM 없는 UTF-8 JSON을 시스템 ANSI 코드 페이지로 잘못 표시할 수 있다. 이 화면만 보고 원본이 손상됐다고 판정하거나 재저장하지 않는다. `Get-Content -Encoding UTF8` 또는 Node의 fatal `TextDecoder`와 `JSON.parse`로 원본 바이트·코드포인트·구문을 확인한다.
