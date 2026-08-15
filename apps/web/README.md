# Reverse Web

`apps/web`은 Reverse의 학생용 온보딩과 교사용 검수 흐름을 보여 주는 독립 Next.js 데모입니다. Astryx 컴포넌트와 디자인 토큰만으로 화면을 구성하며, Vercel에서 이 디렉터리를 프로젝트 루트로 지정해 빌드할 수 있습니다.

## 현재 제공 범위

- 학교급 → 학년 → 과목 → 단원 순서의 한국어 온보딩
- 구체적인 단원을 기본 관심사로 기록하고 범용 관심사 질문 생략
- 번호가 붙은 시나리오 다섯 개
- `시작`, `start`, `[시작]`, `시이작` 같은 분명한 시작 의사의 로컬 판정
- 학생 화면과 분리된 교사 검수 탭
- 근거 있음, 수업 가정, 확인 필요의 구분
- UTF-8-SIG 문서와 UTF-8 무BOM 실행 소스의 문자 무결성 검사

## 현재 제공하지 않는 범위

이 앱에는 백엔드, LLM, 웹 검색, 교육과정 PDF 검색, 로그인, 저장소, 학생 데이터 영구 저장이 없습니다. 화면의 다섯 시나리오는 사실 검색 결과가 아니라 수업 흐름을 확인하는 로컬 템플릿입니다. 따라서 연구·학급 배포 전에는 별도의 근거 검색 서비스와 개인정보 보호 검토가 필요합니다.

## 로컬 검증

Node.js 20 이상과 pnpm 11이 필요합니다.

```text
pnpm install --frozen-lockfile
pnpm run check
pnpm run dev
```

## Vercel

GitHub 저장소를 Vercel에 연결하고 Root Directory를 `apps/web`으로 지정합니다. 환경 변수와 외부 리소스는 필요하지 않습니다. 빌드 명령은 `pnpm run build`, 설치 명령은 `pnpm install --frozen-lockfile`입니다.

실제 배포가 끝나기 전에는 “배포 완료”라고 표시하지 않습니다. 이 디렉터리는 현재 로컬 빌드 가능한 배포 후보입니다.

## 라이선스와 고지

Reverse는 Apache License 2.0으로 배포됩니다. 전체 조건은 `LICENSE`, 원 프로젝트의 저작자와 수정 고지는 `NOTICE`를 확인하세요.

웹 배포에서는 `/LICENSE`와 `/NOTICE`가 같은 원문을 바이트 변경 없이 제공합니다.

교육용 재설계의 참고 원본:

- Singulari-Tea Codex: A Modular Architecture for Dynamic Narrative Simulation
- Copyright 2025 fewweekslater (lemos999)
- https://github.com/lemos999/Singulari-Tea-Codex-Prompt-for-Gemini
- Apache License 2.0
