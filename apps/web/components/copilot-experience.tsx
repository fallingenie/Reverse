import {AppShell} from '@astryxdesign/core/AppShell';
import {Banner} from '@astryxdesign/core/Banner';
import {HStack} from '@astryxdesign/core/HStack';
import {Heading} from '@astryxdesign/core/Heading';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {Section} from '@astryxdesign/core/Section';
import {TopNav, TopNavHeading} from '@astryxdesign/core/TopNav';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {COPILOT_WEBCHAT_URL} from '@/lib/copilot';

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function CopilotExperience() {
  const topNav = (
    <TopNav
      label="Reverse 주요 탐색"
      heading={<TopNavHeading heading="Reverse" subheading="근거 기반 수업" />}
      endContent={
        <HStack gap={4} wrap="wrap">
          <Link href={`${publicBasePath}/guide/`} hasUnderline isStandalone>
            교사용 안내
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
    <AppShell
      topNav={topNav}
      banner={
        <Banner
          status="warning"
          title="조직 계정 로그인이 필요할 수 있습니다"
          description="이 대화창은 Microsoft Copilot Studio에서 제공됩니다. 학생의 이름, 연락처, 학번, 건강·가정 정보 같은 개인정보를 Copilot에 입력하지 마세요. 화면이 열리지 않으면 교사용 안내를 확인하거나 새 창 링크를 사용하세요."
        />
      }
      contentPadding={0}
      height="fill"
      variant="section"
    >
      <VisuallyHidden as="div">
        <Heading level={1}>Reverse 수업 대화</Heading>
      </VisuallyHidden>
      <Layout
        height="fill"
        content={
          <LayoutContent padding={0} isScrollable={false} label="Reverse 대화 화면">
            <Section width="100%" height="100%" padding={0} variant="transparent">
              <iframe
                src={COPILOT_WEBCHAT_URL}
                title="Reverse Copilot 수업 대화"
                loading="eager"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="clipboard-write"
                style={{width: '100%', height: '100%', border: 0}}
              />
            </Section>
          </LayoutContent>
        }
      />
    </AppShell>
  );
}
