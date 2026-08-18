'use client';

import {useState} from 'react';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {
  Layout,
  LayoutContent,
  LayoutPanel,
} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {Overlay} from '@astryxdesign/core/Overlay';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Text} from '@astryxdesign/core/Text';
import {
  TopNav,
  TopNavHeading,
} from '@astryxdesign/core/TopNav';
import {VStack} from '@astryxdesign/core/VStack';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {COPILOT_WEBCHAT_URL} from '@/lib/copilot';

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function CompactNavigationLink({
  href,
  icon,
  children,
  isExternalLink = false,
}: Readonly<{
  href: string;
  icon?: 'info';
  children: string;
  isExternalLink?: boolean;
}>) {
  return (
    <Link
      href={href}
      isExternalLink={isExternalLink}
      newTabLabel="새 탭에서 열림"
      isStandalone
    >
      <Card variant="transparent" padding={3}>
        <HStack gap={1.5} vAlign="center">
          {icon ? <Icon icon={icon} color="secondary" /> : null}
          {children}
        </HStack>
      </Card>
    </Link>
  );
}

function DesktopExperienceRail() {
  return (
    <LayoutPanel
      width={272}
      padding={5}
      hasDivider
      isScrollable={false}
      label="Reverse 안내"
      style={{background: 'var(--color-background-teal)'}}
    >
      <VStack height="100%" vAlign="between">
        <VStack gap={6}>
          <VStack gap={3}>
            <HStack gap={2} vAlign="center">
              <NavIcon
                icon={
                  <Text type="label" weight="bold" color="inherit">
                    R
                  </Text>
                }
              />
              <Heading level={1}>Reverse</Heading>
            </HStack>
            <Text type="label" color="accent">
              장면형 · 근거 기반 수업
            </Text>
            <Text type="large" weight="semibold" textWrap="balance">
              선택은 이야기를 움직이고, 근거는 수업을 지탱합니다.
            </Text>
            <Text type="supporting" textWrap="pretty">
              Microsoft Copilot Studio의 수업 에이전트를 이 화면에서 바로
              사용하세요.
            </Text>
          </VStack>

          <Divider />

          <VStack gap={2}>
            <Link href={`${publicBasePath}/guide/`} isStandalone>
              <Card variant="default" padding={3} elevation="low">
                <HStack gap={2} vAlign="center">
                  <Icon icon="info" color="accent" />
                  교사 안내 열기
                </HStack>
              </Card>
            </Link>
            <Link
              href={COPILOT_WEBCHAT_URL}
              isExternalLink
              newTabLabel="새 탭에서 열림"
              isStandalone
            >
              <Card variant="transparent" padding={3}>
                대화만 크게 보기
              </Card>
            </Link>
          </VStack>
        </VStack>

        <VStack gap={2}>
          <Divider />
          <Text type="supporting" textWrap="pretty">
            이 대화창은 Microsoft가 제공하는 외부 서비스입니다. 실명,
            연락처, 학번, 건강·가정 정보는 입력하지 마세요.
          </Text>
        </VStack>
      </VStack>
    </LayoutPanel>
  );
}

export function CopilotExperience() {
  const [isFrameDocumentLoaded, setIsFrameDocumentLoaded] = useState(false);
  const isCompact = useMediaQuery('(max-width: 1023px)');

  return (
    <AppShell
      contentPadding={0}
      height="fill"
      variant="surface"
      mobileNav={false}
      topNav={isCompact ? (
        <TopNav
          label="Reverse 수업 도구"
          heading={
            <TopNavHeading
              heading="Reverse"
              logo={
                <NavIcon
                  icon={
                    <Text type="label" weight="bold" color="inherit">
                      R
                    </Text>
                  }
                />
              }
            />
          }
          endContent={
            <HStack gap={1.5} vAlign="center">
              <CompactNavigationLink
                href={`${publicBasePath}/guide/`}
                icon="info"
              >
                안내
              </CompactNavigationLink>
              <CompactNavigationLink
                href={COPILOT_WEBCHAT_URL}
                isExternalLink
              >
                새 창
              </CompactNavigationLink>
            </HStack>
          }
        />
      ) : undefined}
    >
      <Layout
        height="fill"
        start={isCompact ? undefined : <DesktopExperienceRail />}
        content={
          <LayoutContent
            padding={0}
            isScrollable={false}
            label="Reverse Copilot 수업 대화"
          >
            <VisuallyHidden>
              이 대화창은 Microsoft가 제공하는 외부 서비스이며 Reverse가 직접
              통제하지 않습니다. 실명, 연락처, 학번, 건강·가정 정보 등 개인정보를
              입력하지 마세요.
            </VisuallyHidden>
            <Overlay
              isOpen={!isFrameDocumentLoaded}
              scrim="light"
              position="fill"
              align="center"
              style={{width: '100%', height: '100%'}}
              content={
                <Spinner
                  size="lg"
                  label="Microsoft Copilot 화면 문서를 불러오고 있습니다"
                />
              }
            >
              <iframe
                src={COPILOT_WEBCHAT_URL}
                title="Reverse Copilot 수업 대화"
                loading="eager"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="clipboard-write"
                onLoad={() => setIsFrameDocumentLoaded(true)}
                style={{width: '100%', height: '100%', border: 'none'}}
              />
            </Overlay>
          </LayoutContent>
        }
      />
    </AppShell>
  );
}
