# Reverse Windows 독립 실행 프로토타입

Windows 호스트는 Canon과 참조 문서의 무결성을 코드로 강제한다. LLM을 내장하거나 특정 클라우드 모델을 보장하지 않는다.

현재 소스 지원 범위:

- Python 3.12~3.13
- 추가 전용 NDJSON 원장과 SHA-256 해시 체인
- T0/T1 쓰기 권한 검사
- `UNKNOWN_LOCKED`와 누락된 인과 앵커 차단
- 텍스트 기반 PDF 추출, 페이지·청크·해시 기록
- ChatGPT/Copilot에 전달할 Context Pack과 Reference Pack 생성
- 스캔 PDF는 `OCR_REQUIRED`로 중단

개발 실행과 검증:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m reverse_app doctor
```

Windows onedir 빌드:

```powershell
.\build.ps1
```

`requirements.lock`은 이 저장소에서 시험한 정확한 버전 목록이다. 패키지 파일 자체의 공급망 해시를 고정한 lock은 아니므로, 최종 기관 배포에서는 승인된 사내 인덱스나 별도 해시 잠금을 추가해야 한다.

실제 빌드와 테스트를 통과하기 전에는 `dist` 폴더를 배포 완료본으로 취급하지 않는다. 원본 교과서 PDF, 생성된 교사 로컬 상태, API 키는 Git에 추가하지 않는다.

프로젝트는 Apache License 2.0에 따라 배포된다. 상위 폴더의 `LICENSE`와 `NOTICE`를 유지한다.
