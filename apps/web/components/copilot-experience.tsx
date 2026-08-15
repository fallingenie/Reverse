import {AppShell} from '@astryxdesign/core/AppShell';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {HStack} from '@astryxdesign/core/HStack';
import {Heading} from '@astryxdesign/core/Heading';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {TopNav, TopNavHeading} from '@astryxdesign/core/TopNav';
import {VStack} from '@astryxdesign/core/VStack';
import {LicenseNotice} from '@/components/reverse-workspace';
import {COPILOT_WEBCHAT_URL} from '@/lib/copilot';

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function CopilotExperience() {
  const topNav = (
    <TopNav
      label="Copilot 체험 주요 탐색"
      heading={<TopNavHeading heading="Reverse" subheading="Copilot 체험" />}
      endContent={
        <HStack gap={4} wrap="wrap">
          <Link href={`${publicBasePath}/`} hasUnderline isStandalone>
            학생 수업으로 돌아가기
          </Link>
          <Link
            href={COPILOT_WEBCHAT_URL}
            hasUnderline
            isExternalLink
            isStandalone
            newTabLabel="새 탭에서 열림"
          >
            새 창에서 열기
          </Link>
        </HStack>
      }
    />
  );

  return (
    <AppShell topNav={topNav} contentPadding={0} height="auto" variant="section">
      <Layout
        height="auto"
        content={
          <LayoutContent padding={4}>
            <VStack gap={6}>
              <VStack gap={2}>
                <Heading level={1}>Copilot 체험</Heading>
                <Text type="large" color="secondary">
                  Microsoft Copilot Studio에서 제공하는 Reverse 대화 화면을
                  이 페이지 안에서 엽니다.
                </Text>
              </VStack>

              <Banner
                status="warning"
                title="조직 계정과 로그인이 필요할 수 있습니다"
                description="조직 정책, 지원 환경, 계정 권한 또는 로그인 상태에 따라 체험이 열리지 않을 수 있습니다. Reverse는 접근 권한을 우회하거나 테넌트 설정을 자동으로 바꾸지 않습니다."
              />

              <HStack gap={4} wrap="wrap">
                <Link
                  href={COPILOT_WEBCHAT_URL}
                  hasUnderline
                  isExternalLink
                  isStandalone
                  newTabLabel="새 탭에서 열림"
                >
                  Copilot 체험을 새 창에서 열기
                </Link>
                <Text color="secondary">
                  아래 화면이 차단되면 이 링크를 사용하세요.
                </Text>
              </HStack>

              <Card padding={3} elevation="low">
                <AspectRatio ratio={4 / 3} fit="cover">
                  <iframe
                    src={COPILOT_WEBCHAT_URL}
                    title="Reverse Copilot 체험"
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </AspectRatio>
              </Card>

              <LicenseNotice />
            </VStack>
          </LayoutContent>
        }
      />
    </AppShell>
  );
}
