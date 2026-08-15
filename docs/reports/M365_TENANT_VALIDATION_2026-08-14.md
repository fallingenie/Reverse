# Microsoft 365 Copilot 테넌트 검증 보고서

기준일: 2026-08-14
시험 계정: `connectai96@kosacai.onmicrosoft.com`
환경 이름: `한국과학창의재단` 유지

## 패키지 검증

- ZIP: `copilot/appPackage/build/reverse-m365-copilot.zip`
- 크기: 41,624바이트
- SHA-256: `bf01129c2c6845343c848f0cb2775cc03f53d82d76b0df3c9a895c78942e6618`
- Microsoft 365 Agents Toolkit 1.1.15 최종 결과: 59/59 통과

최초 패키지 앱 버전 `0.3.0`은 Microsoft 규칙의 major version 1 이상 조건 때문에 58/59였다. 앱 패키지 버전을 `1.0.0`으로 수정한 뒤 59/59를 통과했다. 최초 실패를 통과로 소급하지 않는다.

## 실제 테넌트 설치

1차 개인 범위 설치는 HTTP 424 `FailedDependency: Container pool is empty`로 실패했다. 추적 ID는 `00-2480bd3ead5546e9bd6914647284f775-05af3ab997a480c0-01`이다.

충분히 간격을 둔 2차 설치는 성공했다.

- TitleId: `T_a89e69a8-eb21-4e9f-f91e-0c711cd32c62`
- AppId: `5e7ccba3-1126-4cf3-97c3-37f6b97639fc`
- 획득 정보: `TenantPersonal`, `sideloaded`, `isOwner=true`, `isShareable=false`

앱은 Microsoft 365 Copilot의 에이전트 목록에 나타났고 선언형 에이전트 화면까지 열렸다. 게시·조직 공유·학생 배포는 하지 않았다.

## 실제 첫 메시지 결과

새 에이전트 대화에서 첫 입력 `3`을 보냈다. 모델의 학교급 판정 응답 대신 다음 플랫폼 오류가 반환됐다.

> 이 에이전트에 대한 액세스 권한이 없습니다. 에이전트의 소유자 또는 관리자에게 액세스 권한을 요청한 후 다시 시도하세요.

따라서 실제 Microsoft 365 런타임 온보딩·안전·출처 동작은 통과하지 못했고 평가 자체가 차단됐다.

## 원인 진단

공식 `atk doctor`는 다음을 경고했다.

> Your Microsoft 365 tenant admin hasn't enabled custom app upload permission for your account.

프로젝트의 `pnpm copilot:tenant-doctor`도 로그인과 로컬 ZIP은 확인했지만 `관리자의 사용자 지정 앱 업로드 허용`을 차단으로 판정한다. 설치 명령의 성공은 실행 권한을 증명하지 않는다.

## 현재 판정

`패키지 형식 통과 / 개인 획득 성공 / 실제 런타임 접근 차단 / 학생 배포 보류`

다음 단계는 학교 IT 관리자가 사용자 지정 앱 업로드 정책과 대상 계정을 확인하는 것이다. 이는 교사가 해결하도록 안내할 항목이 아니며, 정책 변경 권한을 이 프로젝트가 갖는다고 가정하지 않는다. 정책이 허용된 뒤 새 획득 또는 갱신, 첫 메시지, 직접 실행, 메인 Copilot 호출, 응답 모드 변경, 웹 출처를 다시 시험해야 한다.
