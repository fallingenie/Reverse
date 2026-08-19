'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Button} from '@astryxdesign/core/Button';
import {
  ChatComposer,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatSystemMessage,
} from '@astryxdesign/core/Chat';
import {FileInput} from '@astryxdesign/core/FileInput';
import {Heading} from '@astryxdesign/core/Heading';
import {Link} from '@astryxdesign/core/Link';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Text} from '@astryxdesign/core/Text';
import {Thumbnail} from '@astryxdesign/core/Thumbnail';
import {VStack} from '@astryxdesign/core/VStack';
import type {
  Activity,
  Attachment,
  CardAction,
  DirectLine,
  Message,
} from 'botframework-directlinejs';
import {
  COPILOT_TOKEN_PATH,
  COPILOT_TOKEN_REQUEST_HEADER,
  COPILOT_TOKEN_REQUEST_HEADER_VALUE,
  WEBCHAT_TYPING_DELAY_MS,
  WEBCHAT_TYPING_TIMEOUT_MS,
  advanceQuickProfile,
  createChoiceActions,
  createStartConversationActivity,
  ensureInitialAgentAttribution,
  inferNumberedChoiceList,
  isOwnActivity,
  isStartConversationEcho,
  safeAttachmentUrl,
  shouldStartQuickProfile,
  toSuggestedAction,
  visibleChatViewportHeight,
  type CopilotConnectionState,
  type CopilotSuggestedAction,
  type CopilotTokenResponse,
  type QuickProfileState,
} from '@/lib/copilot-webchat';

interface VisibleMessage {
  id: string;
  sender: 'assistant' | 'user';
  text: string;
  attachments: readonly Attachment[];
  timestamp?: string;
}

const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function isMediaAttachment(
  attachment: Attachment,
): attachment is Attachment & {contentUrl: string; name?: string} {
  return (
    'contentUrl' in attachment && typeof attachment.contentUrl === 'string'
  );
}

function toVisibleMessage(activity: Message, text = activity.text): VisibleMessage {
  return {
    id: activity.id ?? globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
    sender: activity.from.role === 'user' ? 'user' : 'assistant',
    text: text?.trim() ?? '',
    attachments: activity.attachments ?? [],
    timestamp: activity.timestamp,
  };
}

function renderInlineText(value: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/giu;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match.index > cursor) {
      nodes.push(value.slice(cursor, match.index).replace(/\*\*/gu, ''));
    }
    nodes.push(
      <Link
        key={`${keyPrefix}-link-${match.index}`}
        href={match[2]}
        isExternalLink
        newTabLabel="새 탭에서 열림"
      >
        {match[1]}
      </Link>,
    );
    cursor = match.index + match[0].length;
  }

  if (cursor < value.length) {
    nodes.push(value.slice(cursor).replace(/\*\*/gu, ''));
  }
  return nodes;
}

function MessageText({text}: Readonly<{text: string}>) {
  const lines = text.split(/\r?\n/gu).filter(line => line.trim());
  return (
    <VStack gap={1}>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        const isHeading = /^\*\*[^*]+\*\*$/u.test(trimmed);
        const readable = trimmed.replace(/^[-*]\s+/u, '• ');
        return (
          <Text
            key={`line-${index}`}
            weight={isHeading ? 'bold' : 'normal'}
            style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}
          >
            {renderInlineText(readable, `line-${index}`)}
          </Text>
        );
      })}
    </VStack>
  );
}

function upsertMessage(
  current: readonly VisibleMessage[],
  next: VisibleMessage,
): VisibleMessage[] {
  const index = current.findIndex(message => message.id === next.id);
  if (index < 0) return [...current, next];
  const copy = [...current];
  copy[index] = next;
  return copy;
}

function postActivity(adapter: DirectLine, activity: Activity): Promise<string> {
  return new Promise((resolve, reject) => {
    adapter.postActivity(activity).subscribe(resolve, reject);
  });
}

function AttachmentView({attachment}: Readonly<{attachment: Attachment}>) {
  if (!isMediaAttachment(attachment)) return null;
  const href = safeAttachmentUrl(attachment.contentUrl);
  if (!href) return null;

  const label = attachment.name?.trim() || '첨부 자료';
  if (attachment.contentType.startsWith('image/')) {
    return (
      <Thumbnail
        src={href}
        alt={label}
        label={label}
        onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}
      />
    );
  }

  return (
    <Link href={href} isExternalLink newTabLabel="새 탭에서 열림">
      {label}
    </Link>
  );
}

function MessageView({message}: Readonly<{message: VisibleMessage}>) {
  const isAssistant = message.sender === 'assistant';
  const timestamp = message.timestamp
    ? new Intl.DateTimeFormat('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(message.timestamp))
    : undefined;

  return (
    <ChatMessage
      sender={message.sender}
      avatar={
        isAssistant ? (
          <Avatar name="Reverse" size="md" tooltip={false} />
        ) : undefined
      }
    >
      {message.text ? (
        <ChatMessageBubble
          variant={isAssistant ? 'ghost' : 'filled'}
          name={isAssistant ? 'Reverse' : undefined}
          metadata={timestamp}
        >
          <MessageText text={message.text} />
        </ChatMessageBubble>
      ) : null}
      {message.attachments.length ? (
        <ChatMessageBubble variant={isAssistant ? 'ghost' : 'filled'}>
          <VStack gap={2}>
            {message.attachments.map((attachment, index) => (
              <AttachmentView
                key={`${message.id}-attachment-${index}`}
                attachment={attachment}
              />
            ))}
          </VStack>
        </ChatMessageBubble>
      ) : null}
    </ChatMessage>
  );
}

export function CustomCopilotChat({
  onStatusChange,
  onUnavailable,
}: Readonly<{
  onStatusChange: (status: CopilotConnectionState) => void;
  onUnavailable: () => void;
}>) {
  const [directLine, setDirectLine] = useState<DirectLine | null>(null);
  const [messages, setMessages] = useState<VisibleMessage[]>([]);
  const [suggestedActions, setSuggestedActions] = useState<
    CopilotSuggestedAction[]
  >([]);
  const [files, setFiles] = useState<File[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [composerError, setComposerError] = useState<string>();
  const [chatViewportHeight, setChatViewportHeight] = useState<number | '100%'>('100%');
  const [quickProfile, setQuickProfile] = useState<QuickProfileState>({
    stage: 'inactive',
  });
  const chatViewportRef = useRef<HTMLElement | null>(null);
  const hasConnected = useRef(false);
  const hasStartedConversation = useRef(false);
  const hasPresentedAttribution = useRef(false);
  const relayedUserID = useRef<string | undefined>(undefined);
  const userID = useMemo(
    () => `reverse-web-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
    [],
  );

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let animationFrame: number | undefined;
    const syncViewport = () => {
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        animationFrame = undefined;
        const container = chatViewportRef.current;
        if (!container) return;

        const nextHeight = visibleChatViewportHeight(
          {height: viewport.height, offsetTop: viewport.offsetTop},
          container.getBoundingClientRect().top,
        );
        if (nextHeight && nextHeight > 0) setChatViewportHeight(nextHeight);

        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && container.contains(activeElement)) {
          activeElement.scrollIntoView({block: 'nearest', inline: 'nearest'});
        }
      });
    };

    syncViewport();
    viewport.addEventListener('resize', syncViewport);
    viewport.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', syncViewport);

    return () => {
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
      viewport.removeEventListener('resize', syncViewport);
      viewport.removeEventListener('scroll', syncViewport);
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
    };
  }, []);

  const appendLocalMessage = useCallback(
    (sender: VisibleMessage['sender'], text: string) => {
      setMessages(current => [
        ...current,
        {
          id: `local-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
          sender,
          text,
          attachments: [],
        },
      ]);
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    let subscription: {unsubscribe: () => void} | undefined;
    let adapter: DirectLine | undefined;
    let active = true;
    let typingDelay: ReturnType<typeof setTimeout> | undefined;
    let typingTimeout: ReturnType<typeof setTimeout> | undefined;

    const clearTypingIndicators = () => {
      if (typingDelay) clearTimeout(typingDelay);
      if (typingTimeout) clearTimeout(typingTimeout);
      typingDelay = undefined;
      typingTimeout = undefined;
      setIsTyping(false);
    };

    const scheduleTypingIndicator = () => {
      if (typingDelay || typingTimeout) return;
      typingDelay = setTimeout(() => {
        typingDelay = undefined;
        if (active) setIsTyping(true);
      }, WEBCHAT_TYPING_DELAY_MS);
      typingTimeout = setTimeout(() => {
        typingTimeout = undefined;
        if (!active) return;
        setIsTyping(false);
        setComposerError(
          '응답이 지연되고 있습니다. 입력은 전송되었으니 잠시 기다려 주세요.',
        );
      }, WEBCHAT_TYPING_TIMEOUT_MS);
    };

    onStatusChange('preparing');
    Promise.all([
      fetch(COPILOT_TOKEN_PATH, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          [COPILOT_TOKEN_REQUEST_HEADER]: COPILOT_TOKEN_REQUEST_HEADER_VALUE,
        },
        signal: controller.signal,
      }),
      import('botframework-directlinejs'),
    ])
      .then(async ([response, directLineModule]) => {
        if (!response.ok) throw new Error('CUSTOM_WEBCHAT_UNAVAILABLE');
        const credentials = (await response.json()) as CopilotTokenResponse;
        if (!credentials.token || !credentials.domain) {
          throw new Error('CUSTOM_WEBCHAT_CREDENTIALS_INVALID');
        }

        adapter = new directLineModule.DirectLine({
          token: credentials.token,
          domain: credentials.domain,
        });

        const activitySubscription = adapter.activity$.subscribe(
          (activity: Activity) => {
            if (!active) return;
            if (isStartConversationEcho(activity, userID)) {
              relayedUserID.current = activity.from.id;
              return;
            }
            if (isOwnActivity(activity, userID, relayedUserID.current)) return;
            if (activity.type === 'typing') {
              scheduleTypingIndicator();
              return;
            }
            if (activity.type !== 'message') return;
            clearTypingIndicators();
            setComposerError(undefined);
            const explicitActions = (activity.suggestedActions?.actions ?? [])
              .map((action: CardAction) => toSuggestedAction(action, userID))
              .filter(
                (action): action is CopilotSuggestedAction => action !== null,
              );
            const inferredChoices = explicitActions.length
              ? null
              : inferNumberedChoiceList(activity.text, userID);
            const visibleText = inferredChoices?.prompt ?? activity.text ?? '';
            const isInitialSchoolPrompt =
              /먼저\s*학교급을\s*선택/u.test(visibleText);
            const attributedText =
              isInitialSchoolPrompt && !hasPresentedAttribution.current
                ? ensureInitialAgentAttribution(visibleText)
                : visibleText;
            if (isInitialSchoolPrompt) {
              hasPresentedAttribution.current = true;
            }
            setMessages(current =>
              upsertMessage(
                current,
                toVisibleMessage(activity, attributedText),
              ),
            );
            if (shouldStartQuickProfile(activity.text, explicitActions)) {
              setQuickProfile({stage: 'school'});
            }
            setSuggestedActions(
              explicitActions.length
                ? explicitActions
                : (inferredChoices?.actions ?? []),
            );
          },
        );

        const statusSubscription = adapter.connectionStatus$.subscribe(
          (status: number) => {
            if (!active) return;
            if (status === 2) {
              hasConnected.current = true;
              onStatusChange('connected');
              if (!hasStartedConversation.current) {
                hasStartedConversation.current = true;
                void postActivity(
                  adapter as DirectLine,
                  createStartConversationActivity(userID),
                ).catch(() => {
                  if (active) onUnavailable();
                });
              }
            } else if (status === 0 || status === 1) {
              onStatusChange('connecting');
            } else if (!hasConnected.current) {
              onUnavailable();
            } else {
              onStatusChange('error');
            }
          },
        );

        subscription = {
          unsubscribe: () => {
            statusSubscription.unsubscribe();
            activitySubscription.unsubscribe();
          },
        };
        if (active) setDirectLine(adapter);
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (active) onUnavailable();
      });

    return () => {
      active = false;
      clearTypingIndicators();
      controller.abort();
      subscription?.unsubscribe();
      adapter?.end();
    };
  }, [onStatusChange, onUnavailable, userID]);

  const send = useCallback(
    async (activity: Message, showLocalMessage = true) => {
      if (!directLine || isSending) return;

      const localAttachments = activity.attachments ?? [];
      if (showLocalMessage) {
        appendLocalMessage(
          'user',
          [
            activity.text?.trim() ?? '',
            localAttachments.length
              ? `첨부: ${localAttachments
                  .map(attachment =>
                    'name' in attachment ? attachment.name : undefined,
                  )
                  .filter(Boolean)
                  .join(', ')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }
      setSuggestedActions([]);
      setComposerError(undefined);
      setIsSending(true);

      try {
        await postActivity(directLine, activity);
      } catch {
        setComposerError(
          '메시지를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.',
        );
        onStatusChange('error');
      } finally {
        for (const attachment of localAttachments) {
          if (
            isMediaAttachment(attachment) &&
            attachment.contentUrl.startsWith('blob:')
          ) {
            URL.revokeObjectURL(attachment.contentUrl);
          }
        }
        setIsSending(false);
      }
    },
    [appendLocalMessage, directLine, isSending, onStatusChange],
  );

  const sendText = useCallback(
    (value: string) => {
      const text = value.trim();
      if ((!text && !files.length) || !directLine) return;

      const attachments: Attachment[] = files.map(file => ({
        contentType: file.type || 'application/octet-stream',
        contentUrl: URL.createObjectURL(file),
        name: file.name,
      }));
      if (
        (quickProfile.stage === 'custom-subject' ||
          quickProfile.stage === 'unit') &&
        text
      ) {
        const transition = advanceQuickProfile(quickProfile, text);
        if (transition) {
          appendLocalMessage('user', text);
          setQuickProfile(transition.state);
          if (transition.prompt) {
            appendLocalMessage('assistant', transition.prompt);
          }
          setSuggestedActions(createChoiceActions(transition.choices, userID));
          if (transition.outboundText) {
            setFiles([]);
            void send(
              {
                type: 'message',
                from: {id: userID, name: '학습자', role: 'user'},
                text: transition.outboundText,
                attachments,
                locale: 'ko-KR',
              },
              false,
            );
          }
          return;
        }
      }

      setFiles([]);
      if (quickProfile.stage !== 'inactive') {
        setQuickProfile({stage: 'inactive'});
        setSuggestedActions([]);
      }
      void send({
        type: 'message',
        from: {id: userID, name: '학습자', role: 'user'},
        text,
        attachments,
        locale: 'ko-KR',
      });
    },
    [appendLocalMessage, directLine, files, quickProfile, send, userID],
  );

  const runSuggestedAction = useCallback(
    (action: CopilotSuggestedAction) => {
      if (action.kind !== 'message') return;

      if (quickProfile.stage !== 'inactive') {
        const selection = action.activity.text?.trim() || action.label;
        const transition = advanceQuickProfile(quickProfile, selection);
        if (transition) {
          appendLocalMessage('user', selection);
          setQuickProfile(transition.state);
          if (transition.prompt) {
            appendLocalMessage('assistant', transition.prompt);
          }
          setSuggestedActions(createChoiceActions(transition.choices, userID));
          if (transition.outboundText) {
            void send(
              {
                type: 'message',
                from: {id: userID, name: '학습자', role: 'user'},
                text: transition.outboundText,
                locale: 'ko-KR',
              },
              false,
            );
          }
          return;
        }
      }

      void send(action.activity);
    },
    [appendLocalMessage, quickProfile, send, userID],
  );

  if (!directLine) {
    return (
      <VStack height="100%" hAlign="center" vAlign="center">
        <Spinner
          size="lg"
          label="Reverse 수업 에이전트에 안전하게 연결하고 있습니다"
        />
      </VStack>
    );
  }

  return (
    <VStack
      as="section"
      ref={chatViewportRef}
      aria-label="Reverse 맞춤형 Copilot 수업 대화"
      width="100%"
      height={chatViewportHeight}
      minHeight={0}
    >
      <ChatLayout
        emptyState={
          <VStack gap={2} hAlign="center">
            <Heading level={2}>안녕하세요. Reverse입니다.</Heading>
            <Text color="secondary">
              학교급부터 차근차근 확인하고 장면형 수업을 시작합니다.
            </Text>
          </VStack>
        }
        composer={
          <ChatComposer
            onSubmit={sendText}
            isDisabled={isSending}
            placeholder="편하게 입력하세요"
            status={
              composerError ? {type: 'error', message: composerError} : undefined
            }
            headerActions={
              <FileInput
                label="수업에 참고할 파일 첨부"
                isLabelHidden
                mode="input"
                isMultiple
                maxFiles={MAX_FILES}
                maxSize={MAX_FILE_SIZE}
                accept="image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                placeholder="파일 첨부"
                value={files}
                onChange={value =>
                  setFiles(Array.isArray(value) ? value : value ? [value] : [])
                }
              />
            }
            headerContext={
              files.length ? (
                <Text type="supporting" color="secondary">
                  {files.length}개 파일 준비됨
                </Text>
              ) : undefined
            }
          />
        }
      >
        <ChatMessageList isStreaming={false} density="spacious">
          {messages.map(message => (
            <MessageView key={message.id} message={message} />
          ))}
          {suggestedActions.length ? (
            <ChatMessage
              sender="assistant"
              avatar={<Avatar name="Reverse" size="md" tooltip={false} />}
            >
              <ChatMessageBubble variant="ghost" name="선택지">
                <VStack gap={2} aria-label="Reverse가 제시한 선택지">
                  {suggestedActions.map((action, index) => (
                    action.kind === 'link' ? (
                      <Link
                        key={`${action.label}-${index}`}
                        href={action.href}
                        isExternalLink
                        newTabLabel="새 탭에서 열림"
                        isStandalone
                      >
                        {action.label}
                      </Link>
                    ) : (
                      <Button
                        key={`${action.label}-${index}`}
                        label={action.label}
                        size="lg"
                        variant="secondary"
                        width="100%"
                        isDisabled={isSending}
                        onClick={() => runSuggestedAction(action)}
                      />
                    )
                  ))}
                </VStack>
              </ChatMessageBubble>
            </ChatMessage>
          ) : null}
          {isTyping ? (
            <ChatSystemMessage>
              선택한 단원으로 시나리오를 구성하고 있습니다.
            </ChatSystemMessage>
          ) : null}
        </ChatMessageList>
      </ChatLayout>
    </VStack>
  );
}
