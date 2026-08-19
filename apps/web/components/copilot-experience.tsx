'use client';

import {useCallback, useState} from 'react';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Card} from '@astryxdesign/core/Card';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {Overlay} from '@astryxdesign/core/Overlay';
import {Spinner} from '@astryxdesign/core/Spinner';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Text} from '@astryxdesign/core/Text';
import {
  Layout,
  LayoutContent,
  LayoutHeader,
} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {StackItem} from '@astryxdesign/core/Stack';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {CustomCopilotChat} from '@/components/custom-copilot-chat';
import {COPILOT_WEBCHAT_URL} from '@/lib/copilot';
import {
  shouldAttemptCustomWebChat,
  type CopilotConnectionState,
} from '@/lib/copilot-webchat';

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const statusLabels: Record<CopilotConnectionState, string> = {
  preparing: '보안 연결 준비 중',
  connecting: 'Agent 연결 중',
  connected: 'Agent 연결됨',
  external: 'Microsoft WebChat 문서 열림',
  error: '연결 확인 필요',
};

function statusVariant(
  status: CopilotConnectionState,
): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'connected') return 'success';
  if (status === 'error') return 'error';
  if (status === 'preparing' || status === 'connecting') return 'warning';
  return 'neutral';
}

function ExperienceHeader({
  status,
  isCompact,
}: Readonly<{
  status: CopilotConnectionState;
  isCompact: boolean;
}>) {
  return (
    <LayoutHeader hasDivider label="Reverse 수업 대화 상태">
      <Card variant="transparent" padding={3}>
        <HStack gap={3} vAlign="center" wrap="wrap">
          <NavIcon
            icon={
              <Text type="label" weight="bold" color="inherit">
                R
              </Text>
            }
          />
          <StackItem size="fill">
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Heading level={1}>Reverse</Heading>
              {!isCompact ? (
                <Text type="supporting" color="secondary">
                  장면형 · 근거 기반 수업
                </Text>
              ) : null}
            </HStack>
          </StackItem>
          <HStack gap={1.5} vAlign="center">
            <StatusDot
              variant={statusVariant(status)}
              label={statusLabels[status]}
              isPulsing={status === 'preparing' || status === 'connecting'}
            />
            <Text type="supporting" weight="medium">
              {statusLabels[status]}
            </Text>
          </HStack>
          <Link href={`${publicBasePath}/guide/`} isStandalone>
            교사 안내
          </Link>
          <Link
            href={COPILOT_WEBCHAT_URL}
            isExternalLink
            newTabLabel="새 탭에서 열림"
            isStandalone
          >
            새 창
          </Link>
        </HStack>
      </Card>
    </LayoutHeader>
  );
}

function CopilotIframe({
  isLoaded,
  onLoad,
}: Readonly<{
  isLoaded: boolean;
  onLoad: () => void;
}>) {
  return (
    <Overlay
      isOpen={!isLoaded}
      scrim="light"
      position="fill"
      align="center"
      style={{width: '100%', height: '100%'}}
      content={
        <Spinner size="lg" label="Microsoft Copilot WebChat 문서를 불러오고 있습니다" />
      }
    >
      <iframe
        src={COPILOT_WEBCHAT_URL}
        title="Reverse Copilot 수업 대화"
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="clipboard-write"
        onLoad={onLoad}
        style={{width: '100%', height: '100%', border: 'none'}}
      />
    </Overlay>
  );
}

export function CopilotExperience() {
  const [mode, setMode] = useState<'custom' | 'iframe'>(() =>
    shouldAttemptCustomWebChat() ? 'custom' : 'iframe',
  );
  const [status, setStatus] = useState<CopilotConnectionState>(
    mode === 'custom' ? 'preparing' : 'external',
  );
  const [isFrameDocumentLoaded, setIsFrameDocumentLoaded] = useState(false);
  const isCompact = useMediaQuery('(max-width: 767px)');

  const useIframeFallback = useCallback(() => {
    setMode('iframe');
    setStatus('external');
  }, []);

  return (
    <AppShell
      contentPadding={0}
      height="fill"
      variant="surface"
      mobileNav={false}
    >
      <Layout
        height="fill"
        header={<ExperienceHeader status={status} isCompact={isCompact} />}
        content={
          <LayoutContent
            padding={0}
            isScrollable={false}
            label="Reverse Copilot 수업 대화"
          >
            <VisuallyHidden>
              이 대화는 Microsoft Copilot 서비스와 연결되며 Reverse가 외부
              서비스의 동작을 직접 통제하지 않습니다. 실명, 연락처, 학번,
              건강·가정 정보 등 개인정보와 민감정보를 입력하지 마세요.
            </VisuallyHidden>
            {mode === 'custom' ? (
              <CustomCopilotChat
                onStatusChange={setStatus}
                onUnavailable={useIframeFallback}
              />
            ) : (
              <CopilotIframe
                isLoaded={isFrameDocumentLoaded}
                onLoad={() => {
                  setIsFrameDocumentLoaded(true);
                  setStatus('external');
                }}
              />
            )}
          </LayoutContent>
        }
      />
    </AppShell>
  );
}
