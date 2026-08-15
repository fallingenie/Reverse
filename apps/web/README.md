# Reverse Web

`apps/web`은 Reverse의 학생용 온보딩과 교사용 검수 흐름을 보여 주는 독립 Next.js 데모입니다. Astryx 컴포넌트와 디자인 토큰만으로 화면을 구성하며, Vercel에서 이 디렉터리를 프로젝트 루트로 지정해 빌드할 수 있습니다.

## 현재 제공 범위

- 학교급 → 학년 → 과목 → 단원 순서의 한국어 온보딩
- 구체적인 단원을 기본 관심사로 기록하고 범용 관심사 질문 생략
- 번호가 붙은 시나리오 다섯 개
- `시작`, `start`, `[시작]`, `시이작` 같은 분명한 시작 의사의 로컬 판정
- 학생 화면과 분리된 교사 검수 탭
- `/copilot`에서 제공하는 Microsoft Copilot Studio WebChat 체험과 새 창 대체 링크
- 교사 키로 잠금을 해제한 뒤 학생 프로필을 검토하고 대화를 Markdown으로 내보내는 Vercel 전용 기능
- 근거 있음, 수업 가정, 확인 필요의 구분
- UTF-8-SIG 문서와 UTF-8 무BOM 실행 소스의 문자 무결성 검사

## 현재 제공하지 않는 범위

이 앱 자체에는 LLM, 웹 검색, 교육과정 PDF 검색, 사용자 계정 체계, 서버 데이터베이스가 없습니다. `/copilot`의 iframe은 별도 Microsoft 서비스이며 조직 정책, 지원 환경, 로그인, 계정 권한에 따라 열리지 않을 수 있습니다. 화면의 다섯 시나리오는 사실 검색 결과가 아니라 수업 흐름을 확인하는 로컬 템플릿입니다. 따라서 연구·학급 배포 전에는 별도의 근거 검색 서비스와 개인정보 보호 검토가 필요합니다.

교사 기능은 Vercel Functions에서만 키를 검증합니다. 서버 환경 변수가 없거나 GitHub Pages로 실행하면 잠긴 상태를 유지합니다. 학생 프로필은 가명 식별자와 교사가 확인한 관찰만 허용하며, 브라우저에 저장할 때도 교사 키로 암호화합니다. 현재 로그인 실패 제한은 서버리스 인스턴스 단위이므로 정식 운영 전에는 Vercel Firewall 또는 영속형 제한 장치를 추가해야 합니다.

## 로컬 검증

Node.js 20 이상과 pnpm 11이 필요합니다.

```powershell
pnpm install --frozen-lockfile
pnpm run check
pnpm run dev
```

교사 기능까지 로컬에서 시험하려면 아래 블록을 PowerShell에 그대로 붙여 넣습니다. 입력한 교사 키 원문은 파일에 저장하지 않습니다.

```powershell
$teacherKey = Read-Host '시험용 교사 키'
$env:REVERSE_TEACHER_KEY_SHA256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($teacherKey))).ToLowerInvariant()
$env:REVERSE_TEACHER_SESSION_SECRET = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
pnpm run dev
```

## Vercel

GitHub 저장소를 Vercel에 연결하고 Root Directory를 `apps/web`으로 지정합니다. 기본 데모에는 환경 변수가 필요하지 않습니다. 교사용 내보내기를 열려면 `REVERSE_TEACHER_KEY_SHA256`과 32자 이상의 `REVERSE_TEACHER_SESSION_SECRET`을 Vercel 서버 환경 변수로 설정해야 합니다. 빌드 명령은 `pnpm run build`, 설치 명령은 `pnpm install --frozen-lockfile`입니다.

Vercel CLI로 키를 설정하고 바로 Production에 배포하려면 `apps/web`에서 아래 블록을 붙여 넣습니다. 실행 중 교사 키를 한 번 입력합니다.

```powershell
$teacherKey = Read-Host '배포용 교사 키'
$teacherKeyHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($teacherKey))).ToLowerInvariant()
$sessionSecret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$teacherKeyHash | npx vercel env add REVERSE_TEACHER_KEY_SHA256 production
$sessionSecret | npx vercel env add REVERSE_TEACHER_SESSION_SECRET production
npx vercel --prod
```

실제 배포가 끝나기 전에는 “배포 완료”라고 표시하지 않습니다. 이 디렉터리는 현재 로컬 빌드 가능한 배포 후보입니다.

## 라이선스와 고지

Reverse는 Apache License 2.0으로 배포됩니다. 전체 조건은 `LICENSE`, 원 프로젝트의 저작자와 수정 고지는 `NOTICE`를 확인하세요.

웹 배포에서는 `/LICENSE`와 `/NOTICE`가 같은 원문을 바이트 변경 없이 제공합니다.

교육용 재설계의 참고 원본:

- Singulari-Tea Codex: A Modular Architecture for Dynamic Narrative Simulation
- Copyright 2025 fewweekslater (lemos999)
- https://github.com/lemos999/Singulari-Tea-Codex-Prompt-for-Gemini
- Apache License 2.0
