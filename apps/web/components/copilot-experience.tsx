'use client';

import {useState} from 'react';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Card} from '@astryxdesign/core/Card';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {Overlay} from '@astryxdesign/core/Overlay';
import {Spinner} from '@astryxdesign/core/Spinner';
import {
  TopNav,
  TopNavHeading,
} from '@astryxdesign/core/TopNav';
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
      <Card variant="muted" padding={3}>
        <HStack gap={1.5} vAlign="center">
          {icon ? <Icon icon={icon} color="secondary" /> : null}
          {children}
        </HStack>
      </Card>
    </Link>
  );
}

export function CopilotExperience() {
  const [isFrameDocumentLoaded, setIsFrameDocumentLoaded] = useState(false);
  const isPhone = useMediaQuery('(max-width: 767px)');

  return (
    <AppShell
      contentPadding={0}
      height="fill"
      variant="surface"
      mobileNav={false}
      topNav={
        <TopNav
          label="Reverse 수업 도구"
          heading={
            <TopNavHeading
              heading="Reverse"
              headingHref={`${publicBasePath}/`}
              subheading={
                isPhone
                  ? undefined
                  : '근거 기반 장면형 수업 · 개인정보 입력 금지'
              }
              logo={
                isPhone ? undefined : (
                  <NavIcon icon={<Icon icon="wrench" color="primary" />} />
                )
              }
            />
          }
          endContent={
            <HStack gap={1.5} vAlign="center">
              <CompactNavigationLink
                href={`${publicBasePath}/guide/`}
                icon="info"
              >
                {isPhone ? '안내' : '교사 안내'}
              </CompactNavigationLink>
              <CompactNavigationLink
                href={COPILOT_WEBCHAT_URL}
                isExternalLink
              >
                {isPhone ? '새 창' : '대화만 크게 보기'}
              </CompactNavigationLink>
            </HStack>
          }
        />
      }
    >
      <Layout
        height="fill"
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
