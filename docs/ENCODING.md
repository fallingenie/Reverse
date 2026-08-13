# Windows 문자 인코딩 계약

Windows 사용자용 텍스트의 기본은 `UTF-8-SIG`다. 특히 Windows PowerShell 5는 BOM 없는 UTF-8 한국어 `.ps1`을 시스템 ANSI 코드 페이지로 오독할 수 있으므로 모든 PowerShell 스크립트는 UTF-8 BOM으로 저장한다.

## UTF-8-SIG 적용

- `.ps1`
- Windows 앱이 생성하는 사람이 읽는 Markdown Context Pack과 Reference Pack
- 사람이 직접 편집하는 Markdown·YAML·일반 텍스트의 편집기 기본값

## UTF-8 무BOM 예외

- JSON, JSONL, NDJSON
- 해시 체인의 원본 바이트
- CLI의 기계 판독용 JSON stdout
- JavaScript, Python, TOML, lock, spec 같은 실행·프로토콜 파일

JSON과 NDJSON에 BOM을 넣지 않는 이유는 일부 파서가 BOM을 데이터로 취급하고, 원장 바이트 해시가 플랫폼별로 달라지는 문제를 막기 위해서다. 입력 파일은 가능한 곳에서 `utf-8-sig`로 읽어 BOM 유무를 모두 허용한다.

`.editorconfig`가 기본값과 예외를 선언하며 저장소 검증은 PowerShell BOM, JSON 무BOM, 원장 무BOM을 검사한다.
