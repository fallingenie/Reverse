# 교사용 내보내기 보안 안내

이 문서는 Reverse 웹 베타에서 교사가 학생 활동 기록을 검토하고 Markdown으로 내보낼 때 지켜야 할 보안 기준을 설명합니다. 교사 키는 내보내기 화면을 여는 제한된 운영 키입니다. 안전 규칙을 해제하거나, 학생에게 비공개 정답을 보여 주거나, 교사 신분을 증명하는 만능 권한이 아닙니다.

수업을 체험하기만 하는 교사는 이 설정을 할 필요가 없습니다. 먼저 [Reverse 교사용 가이드](TEACHER_GUIDE.md)에 따라 웹 화면을 사용하세요. 이 문서의 Vercel 설정은 자체 배포를 관리하는 학교 정보 담당자나 개발자를 위한 절차입니다.

## 현재 공개 상태

Vercel의 `/teacher/` 화면은 아래 서버 설정이 완료된 경우에만 교사 키로 열립니다. GitHub Pages의 현재 공개 수업 화면에는 교사 프로필 편집이나 Markdown 내보내기 버튼이 없으며, 서버 인증을 사용할 수 없습니다. Copilot 대화 전문은 별도 출처 iframe이라 자동으로 수집하지 않고, 교사가 입력한 최소 구조화 정보만 내보냅니다.

## 무엇을 보호하나요?

- 학생 화면과 교사용 검수 화면을 분리합니다.
- 교사 키 원문을 Vercel 환경 변수에 저장하지 않고 SHA-256 값만 등록합니다.
- 인증에 성공하면 15분 동안 유효한 `HttpOnly`, `Secure`, `SameSite=Strict` 쿠키를 발급합니다.
- 내보내기 요청은 같은 출처에서 온 인증된 요청만 받습니다.
- 학생 프로필은 브라우저 저장소에 남기지 않고 현재 탭의 메모리에만 둡니다.
- 서버 데이터베이스가 없으므로 대화나 프로필을 서버에 영구 보관하지 않습니다.
- Markdown은 서버에서 허용된 필드만 골라 만든 뒤 내려받습니다.

## 베타에서 아직 보장하지 않는 것

- 하나의 공유 교사 키는 교사 개인의 신원을 증명하지 못합니다.
- 실패 횟수 제한은 현재 서버리스 인스턴스 메모리에만 있습니다. 인스턴스가 바뀌면 횟수가 이어지지 않습니다.
- 내보낸 파일의 SHA-256은 파일이 바뀌었는지 확인하는 체크섬입니다. 기관 서명이나 교사 신원 증명은 아닙니다.
- GitHub Pages처럼 서버 기능이 없는 정적 배포에서는 교사 내보내기를 사용할 수 없습니다.
- 정식 운영 전에는 개인별 로그인, 영속형 요청 제한, 감사 로그와 기관의 보존·삭제 절차가 필요합니다.

이 한계가 허용되지 않는 수업에서는 교사 내보내기를 켜지 마세요. Vercel Firewall 또는 영속형 저장소를 이용한 요청 제한과 기관 인증 체계를 먼저 마련해야 합니다.

## 키 만들기와 Vercel 설정

다음 명령은 Windows PowerShell 5.1과 PowerShell 7에서 모두 실행할 수 있습니다. `apps/web` 폴더에서 블록 전체를 그대로 붙여 넣으세요. 교사 키는 화면에 표시하지 않으며, Vercel에는 해시만 보냅니다.

```powershell
$teacherKey = Read-Host '배포용 교사 내보내기 키'

$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
  $keyBytes = [System.Text.Encoding]::UTF8.GetBytes([string]$teacherKey)
  $hashBytes = $sha256.ComputeHash($keyBytes)
  $teacherKeyHash = ([System.BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
} finally {
  $sha256.Dispose()
}

$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$secretBytes = New-Object byte[] 48
try {
  $rng.GetBytes($secretBytes)
  $sessionSecret = [System.Convert]::ToBase64String($secretBytes)
} finally {
  $rng.Dispose()
}

$teacherKeyHash | npx vercel env add REVERSE_TEACHER_KEY_SHA256 production --sensitive
$sessionSecret | npx vercel env add REVERSE_TEACHER_SESSION_SECRET production --sensitive
npx vercel --prod

Remove-Variable teacherKey, keyBytes, hashBytes, teacherKeyHash, secretBytes, sessionSecret -ErrorAction SilentlyContinue
```

교사 키는 길고 예측하기 어렵게 만드세요. 문장, 학교명, 전화번호, 공용 암호를 사용하지 마세요. 기관에서 승인한 암호 관리 도구에만 보관하고, 채팅·이메일·공개 이슈·Git 저장소에 적지 마세요.

## 수업에서 사용하는 방법

1. Vercel 웹 화면의 `/teacher/` 교사 기록 화면을 엽니다.
2. 내보내기가 필요한 시점에만 교사 키를 입력합니다.
3. 학생을 식별할 때는 실명·학번 대신 수업 안에서만 통하는 가명 ID를 사용합니다.
4. 학생이 실제로 한 말이나 행동만 기록합니다. 에이전트가 제안한 행동을 학생의 성취로 바꾸지 마세요.
5. `미평가`, `활동 기록`, `잠정 관찰`을 실제 평가와 구분합니다.
6. 미리보기에서 개인정보·민감정보·근거 없는 능력 판단이 없는지 확인합니다.
7. 필요한 범위만 Markdown으로 내려받고 기관이 정한 저장 위치와 보존 기간을 따릅니다.
8. 작업을 마치면 교사 화면을 잠그고 공유 기기의 탭을 닫습니다.

교사 메모는 자유로운 학생 평가란이 아닙니다. 건강·장애·가정환경·상담 내용·학대 의심과 같은 민감정보를 이 기능에 넣지 마세요. 즉시 보호가 필요한 상황은 학교의 공식 보호 절차로 다루고 웹 내보내기 기록에 복사하지 않습니다.

## 키를 잃어버리거나 노출했을 때

1. 기존 키를 더 이상 사용하지 않습니다.
2. 새 교사 키와 새 세션 비밀값을 만듭니다.
3. 두 Vercel 환경 변수를 모두 교체합니다.
4. 새 배포를 만든 뒤 기존 세션이 더 이상 유효하지 않은지 확인합니다.
5. 노출된 위치와 영향을 기관 보안 담당자에게 비공개로 보고합니다.
6. 공개 이슈에는 키, 해시, 세션 값, 학생 기록을 올리지 않습니다.

## 배포 전 확인표

- [ ] Vercel에 키 원문이 아니라 `REVERSE_TEACHER_KEY_SHA256`만 등록했다.
- [ ] `REVERSE_TEACHER_SESSION_SECRET`은 교사 키와 별도로 만들었다.
- [ ] GitHub Pages에서는 교사 내보내기가 잠긴 상태다.
- [ ] 학생 프로필이 `localStorage`나 `sessionStorage`에 남지 않는다.
- [ ] 실명·학교명·학번·연락처·건강·가정 정보가 없다.
- [ ] 에이전트 시범을 학생 성취로 기록하지 않는다.
- [ ] 내보낸 SHA-256을 전자서명으로 설명하지 않는다.
- [ ] 운영 전 영속형 요청 제한과 개인별 인증 도입 여부를 결정했다.

관련 문서: [Reverse 교사용 가이드](TEACHER_GUIDE.md), [보안 문제 보고](../SECURITY.md), [개인정보 처리 안내](PRIVACY.md), [연구 데이터 운영 원칙](DATA_GOVERNANCE.md), [웹 앱 안내](../apps/web/README.md)

`/cso`는 AI 보조 1차 점검이며 전문 보안감사를 대체하지 않습니다.
