'use client';

import {useState} from 'react';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Card} from '@astryxdesign/core/Card';
import {HStack} from '@astryxdesign/core/HStack';
import {Heading} from '@astryxdesign/core/Heading';
import {Icon} from '@astryxdesign/core/Icon';
import {
  Layout,
  LayoutContent,
  LayoutHeader,
} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {Overlay} from '@astryxdesign/core/Overlay';
import {Section} from '@astryxdesign/core/Section';
import {Spinner} from '@astryxdesign/core/Spinner';
import {StackItem} from '@astryxdesign/core/Stack';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {COPILOT_WEBCHAT_URL} from '@/lib/copilot';

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function NavigationCard({
  href,
  icon,
  label,
  isExternalLink = false,
}: Readonly<{
  href: string;
  icon: 'info' | 'externalLink';
  label: string;
  isExternalLink?: boolean;
}>) {
  return (
    <Link
      href={href}
      isExternalLink={isExternalLink}
      newTabLabel="새 탭에서 열림"
      isStandalone
    >
      <Card variant={isExternalLink ? 'teal' : 'muted'} padding={3}>
        <HStack gap={2} vAlign="center">
          <Icon icon={icon} color={isExternalLink ? 'accent' : 'secondary'} />
          <Text type="label" color="primary">
            {label}
          </Text>
        </HStack>
      </Card>
    </Link>
  );
}

export function CopilotExperience() {
  const [isLoaded, setIsLoaded] = useState(false);
  const isPhone = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(max-width: 1023px)');
  const shellPadding = isPhone ? 0 : isTablet ? 3 : 4;

  return (
    <AppShell contentPadding={0} height="fill" variant="wash">
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider label="Reverse 수업 도구 모음">
            <Section variant="transparent" padding={isPhone ? 3 : 4}>
              <HStack
                gap={isPhone ? 3 : 5}
                hAlign="between"
                vAlign="center"
                wrap="wrap"
              >
                <HStack gap={3} vAlign="center">
                  <NavIcon icon={<Icon icon="wrench" color="accent" />} />
                  <VStack gap={0.5}>
                    <Heading level={1} type={isPhone ? undefined : 'display-3'}>
                      Reverse
                    </Heading>
                    <Text
                      type={isPhone ? 'supporting' : 'large'}
                      color="secondary"
                    >
                      {isPhone
                        ? '근거 기반 장면형 수업'
                        : '근거를 확인하며 이어 가는 장면형 수업'}
                    </Text>
                  </VStack>
                </HStack>

                <HStack gap={2} wrap="wrap">
                  <NavigationCard
                    href={`${publicBasePath}/guide/`}
                    icon="info"
                    label={isPhone ? '교사 안내' : '교사용 안내'}
                  />
                  <NavigationCard
                    href={COPILOT_WEBCHAT_URL}
                    icon="externalLink"
                    label={isPhone ? '새 창' : '대화창만 크게 열기'}
                    isExternalLink
                  />
                </HStack>
              </HStack>
            </Section>
          </LayoutHeader>
        }
        content={
          <LayoutContent
            padding={shellPadding}
            isScrollable={false}
            label="Reverse 수업 대화"
          >
            <Card
              width="100%"
              height="100%"
              padding={0}
              elevation={isPhone ? 'none' : 'low'}
            >
              <VStack width="100%" height="100%" gap={0}>
                <Section variant="muted" padding={isPhone ? 2 : 3}>
                  <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
                    <HStack gap={2} vAlign="center">
                      <Icon icon="info" color="accent" />
                      <VStack gap={0.5}>
                        <Heading level={2}>수업 대화</Heading>
                        <Text type="supporting" color="secondary">
                          {isPhone
                            ? 'Microsoft 제공 화면 · 개인정보 입력 금지'
                            : '이 대화 화면은 Microsoft가 제공하며 Reverse가 외부 콘텐츠를 직접 통제하지 않습니다. 이름, 연락처, 학번, 건강·가정 정보는 입력하지 마세요.'}
                        </Text>
                      </VStack>
                    </HStack>
                    <HStack gap={2} vAlign="center">
                      <StatusDot
                        variant={isLoaded ? 'neutral' : 'warning'}
                        label={
                          isLoaded
                            ? '외부 대화 화면 로드 이벤트 수신'
                            : '대화 화면 불러오는 중'
                        }
                      />
                      <Text type="label" color="secondary">
                        {isLoaded ? '외부 화면 불러옴' : '불러오는 중'}
                      </Text>
                    </HStack>
                  </HStack>
                </Section>

                <StackItem size="fill">
                  <Overlay
                    isOpen={!isLoaded}
                    scrim="light"
                    position="fill"
                    align="center"
                    style={{width: '100%', height: '100%'}}
                    content={
                      <Spinner
                        size="lg"
                        label="Reverse 수업 대화창을 불러오고 있습니다"
                      />
                    }
                  >
                    <iframe
                      src={COPILOT_WEBCHAT_URL}
                      title="Reverse Copilot 수업 대화"
                      loading="eager"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="clipboard-write"
                      onLoad={() => setIsLoaded(true)}
                      style={{width: '100%', height: '100%', border: 'none'}}
                    />
                  </Overlay>
                </StackItem>
              </VStack>
            </Card>
          </LayoutContent>
        }
      />
    </AppShell>
  );
}
