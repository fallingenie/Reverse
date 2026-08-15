# Reverse Web

`apps/web`은 Microsoft Copilot Studio의 Reverse 에이전트를 보여 주는 Next.js 웹 화면입니다. 첫 화면은 Copilot 대화창을 삽입하고, `/guide/`는 컴퓨터 사용이 익숙하지 않은 교사를 위한 안내를 제공합니다. 화면은 Astryx 구성요소와 디자인 토큰으로 만들었습니다.

## 교사로서 바로 사용하기

수업을 체험하기 위해 GitHub 저장소를 내려받거나 Node.js·pnpm을 설치할 필요는 없습니다.

- [Vercel 수업 화면](https://reverse-education-beta.vercel.app/)
- [GitHub Pages 화면](https://fallingenie.github.io/Reverse/)
- [Reverse 교사용 가이드](../../docs/TEACHER_GUIDE.md)

Vercel에 접속할 수 없으면 GitHub Pages를 사용할 수 있습니다. 두 화면의 Copilot 대화는 Microsoft가 제공하는 외부 서비스이므로, 조직 정책·지원 환경·로그인·계정 권한에 따라 열리지 않을 수 있습니다. Reverse가 Microsoft 계정 권한이나 Copilot Studio 설정을 바꾸지는 못합니다.

## 현재 공개 화면

- `/`: 게시된 Copilot Studio WebChat과 새 창으로 여는 대체 링크
- `/guide/`: 설치 없는 시작 방법, 로그인 문제 해결, 개인정보와 교사 기록 안내
- `/LICENSE`, `/NOTICE`: Apache License 2.0과 원 저작자 고지

이전의 로컬 시나리오 생성 예제는 공개 제품 화면에서 제거했습니다. 수업 내용과 대화는 삽입된 Copilot 에이전트가 제공합니다.

## 현재 제공하지 않는 기능

이 앱 자체에는 생성형 AI, 웹 검색, 교육과정 PDF 검색, 사용자 계정 체계, 서버 데이터베이스가 없습니다. Copilot 대화 내용의 처리와 보존은 Microsoft 서비스와 기관 정책을 따릅니다.

현재 공개 화면에는 교사 프로필 편집이나 Markdown 내보내기 버튼이 없습니다. 관련 서버 모듈은 공개 기능으로 연결하고 회귀 검증하기 전까지 배포 기능으로 간주하지 않습니다. GitHub Pages는 정적 배포이므로 서버 기반 교사 키 확인과 내보내기를 지원할 수 없습니다.

향후 교사 내보내기를 연결할 때의 키 관리, 개인정보와 운영 경계는 [교사용 내보내기 보안 안내](../../docs/TEACHER_EXPORT_SECURITY.md)를 따릅니다.

## 개발자가 로컬에서 확인하기

Node.js 20 이상과 pnpm 11이 필요합니다. 저장소의 `apps/web` 폴더에서 실행하세요.

```powershell
pnpm install --frozen-lockfile
pnpm run check
pnpm run dev
```

`pnpm run check`는 문자 인코딩, TypeScript, 자동 테스트, 프로덕션 빌드를 차례로 확인합니다.

## Vercel에 연결하기

GitHub 저장소를 Vercel 프로젝트에 연결하고 Root Directory를 `apps/web`으로 지정합니다.

- 설치 명령: `pnpm install --frozen-lockfile`
- 빌드 명령: `pnpm run build`
- 현재 공개 웹 셸에 필요한 환경 변수: 없음

실제 배포 주소를 열어 Copilot 삽입 화면, 새 창 대체 링크, `/guide/`, `/LICENSE`, `/NOTICE`를 확인하기 전에는 배포 완료라고 표시하지 않습니다.

## GitHub Pages에 연결하기

저장소의 Pages 작업 흐름은 `GITHUB_PAGES=true`로 정적 파일을 만듭니다. 이때 Next.js의 `basePath`, `assetPrefix`, 정적 내보내기, 폴더형 URL을 함께 사용합니다. Pages에서는 서버 기능을 사용할 수 없다는 제한을 교사에게 숨기지 않습니다.

## 라이선스와 고지

Reverse는 Apache License 2.0으로 배포됩니다. 전체 조건은 `LICENSE`, 원 프로젝트의 저작자와 수정 고지는 `NOTICE`를 확인하세요.

교육용 재설계의 참고 원본:

- Singulari-Tea Codex: A Modular Architecture for Dynamic Narrative Simulation
- Copyright 2025 fewweekslater (lemos999)
- https://github.com/lemos999/Singulari-Tea-Codex-Prompt-for-Gemini
- Apache License 2.0
