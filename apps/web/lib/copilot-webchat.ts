import type {Activity, CardAction, Message} from 'botframework-directlinejs';

export const COPILOT_TOKEN_PATH = '/api/copilot/token';
export const COPILOT_TOKEN_REQUEST_HEADER = 'X-Reverse-WebChat';
export const COPILOT_TOKEN_REQUEST_HEADER_VALUE = 'custom-webchat-v1';
export const WEBCHAT_TYPING_DELAY_MS = 900;
export const WEBCHAT_TYPING_TIMEOUT_MS = 30000;
export const REVERSE_AGENT_ATTRIBUTION =
  'Reverse [© 2026 fallingenie](https://github.com/fallingenie) · Apache-2.0 · [Singulari-Tea Codex © 2025 fewweekslater (lemos999)](https://github.com/lemos999/Singulari-Tea-Codex-Prompt-for-Gemini) 기반 교육용 재구현 · [LICENSE/NOTICE](https://github.com/fallingenie/Reverse)';

export interface VisualViewportBounds {
  height: number;
  offsetTop: number;
}

export function visibleChatViewportHeight(
  viewport: VisualViewportBounds,
  containerTop: number,
): number | null {
  if (
    !Number.isFinite(viewport.height) ||
    viewport.height <= 0 ||
    !Number.isFinite(viewport.offsetTop) ||
    !Number.isFinite(containerTop)
  ) {
    return null;
  }

  const viewportBottom = viewport.offsetTop + viewport.height;
  const visibleTop = Math.max(viewport.offsetTop, containerTop);
  return Math.max(0, Math.floor(viewportBottom - visibleTop));
}

export type CopilotConnectionState =
  | 'preparing'
  | 'connecting'
  | 'connected'
  | 'external'
  | 'error';

export interface CopilotTokenResponse {
  token: string;
  domain: string;
  expiresIn?: number;
}

export interface CopilotMessageAction {
  kind: 'message';
  label: string;
  activity: Message;
}

export interface CopilotLinkAction {
  kind: 'link';
  label: string;
  href: string;
}

export type CopilotSuggestedAction = CopilotMessageAction | CopilotLinkAction;

export interface InferredChoiceList {
  prompt: string;
  actions: CopilotMessageAction[];
}

export const SCHOOL_LEVEL_CHOICES = ['초등학교', '중학교', '고등학교'] as const;
export const SUBJECT_CHOICES = [
  '국어',
  '수학',
  '사회·역사',
  '과학',
  '도덕·윤리',
  '기타·직접 입력',
] as const;

export type SchoolLevel = (typeof SCHOOL_LEVEL_CHOICES)[number];
export type QuickProfileState =
  | {stage: 'inactive'}
  | {stage: 'school'}
  | {stage: 'grade'; schoolLevel: SchoolLevel}
  | {stage: 'subject'; schoolLevel: SchoolLevel; grade: string}
  | {stage: 'custom-subject'; schoolLevel: SchoolLevel; grade: string}
  | {
      stage: 'unit';
      schoolLevel: SchoolLevel;
      grade: string;
      subject: string;
    };

export interface QuickProfileTransition {
  state: QuickProfileState;
  prompt?: string;
  choices: readonly string[];
  outboundText?: string;
}

export function gradeChoicesForSchool(schoolLevel: SchoolLevel): readonly string[] {
  if (schoolLevel === '초등학교') return ['3학년', '4학년', '5학년', '6학년'];
  if (schoolLevel === '중학교') return ['1학년', '2학년', '3학년'];
  return ['1학년', '2학년'];
}

export function createChoiceActions(
  choices: readonly string[],
  userID: string,
): CopilotMessageAction[] {
  return choices.map(label => ({
    kind: 'message',
    label,
    activity: {
      type: 'message',
      from: {id: userID, name: '학습자', role: 'user'},
      text: label,
      locale: 'ko-KR',
    },
  }));
}

export function shouldStartQuickProfile(
  prompt: unknown,
  actions: readonly CopilotSuggestedAction[],
): boolean {
  if (typeof prompt !== 'string' || !/먼저\s*학교급을\s*선택/u.test(prompt)) {
    return false;
  }
  const labels = actions
    .filter((action): action is CopilotMessageAction => action.kind === 'message')
    .map(action => action.label);
  return SCHOOL_LEVEL_CHOICES.every(label => labels.includes(label));
}

export function ensureInitialAgentAttribution(prompt: string): string {
  const normalized = prompt.trim();
  if (normalized.includes(REVERSE_AGENT_ATTRIBUTION)) {
    return normalized;
  }
  return `${REVERSE_AGENT_ATTRIBUTION}\n\n${normalized}`;
}

export function advanceQuickProfile(
  current: QuickProfileState,
  selection: string,
): QuickProfileTransition | null {
  const value = selection.trim();
  if (!value) return null;

  if (current.stage === 'school') {
    if (!SCHOOL_LEVEL_CHOICES.includes(value as SchoolLevel)) return null;
    const schoolLevel = value as SchoolLevel;
    return {
      state: {stage: 'grade', schoolLevel},
      prompt: '몇 학년인가요?',
      choices: gradeChoicesForSchool(schoolLevel),
    };
  }

  if (current.stage === 'grade') {
    if (!gradeChoicesForSchool(current.schoolLevel).includes(value)) return null;
    return {
      state: {stage: 'subject', schoolLevel: current.schoolLevel, grade: value},
      prompt: '과목을 골라 주세요.',
      choices: SUBJECT_CHOICES,
    };
  }

  if (current.stage === 'subject') {
    if (!SUBJECT_CHOICES.includes(value as (typeof SUBJECT_CHOICES)[number])) {
      return null;
    }
    if (value === '기타·직접 입력') {
      return {
        state: {
          stage: 'custom-subject',
          schoolLevel: current.schoolLevel,
          grade: current.grade,
        },
        prompt: '과목명을 직접 입력해 주세요.',
        choices: [],
      };
    }
    return {
      state: {
        stage: 'unit',
        schoolLevel: current.schoolLevel,
        grade: current.grade,
        subject: value,
      },
      prompt:
        '교과서에 적힌 현재 단원명을 그대로 입력해 주세요. 모르면 “모르겠다”라고 입력해도 됩니다.',
      choices: [],
    };
  }

  if (current.stage === 'custom-subject') {
    return {
      state: {
        stage: 'unit',
        schoolLevel: current.schoolLevel,
        grade: current.grade,
        subject: value,
      },
      prompt:
        '교과서에 적힌 현재 단원명을 그대로 입력해 주세요. 모르면 “모르겠다”라고 입력해도 됩니다.',
      choices: [],
    };
  }

  if (current.stage === 'unit') {
    return {
      state: {stage: 'inactive'},
      choices: [],
      outboundText: `${current.schoolLevel} ${current.grade} ${current.subject}, 단원: ${value}`,
    };
  }

  return null;
}

export function isStartConversationEcho(
  activity: Activity,
  localUserID: string,
): boolean {
  return (
    activity.type === 'event' &&
    activity.name === 'startConversation' &&
    Boolean(activity.from?.id) &&
    activity.from.id !== localUserID
  );
}

export function isOwnActivity(
  activity: Activity,
  localUserID: string,
  relayedUserID?: string,
): boolean {
  return (
    activity.from?.id === localUserID ||
    (Boolean(relayedUserID) && activity.from?.id === relayedUserID)
  );
}

export function createStartConversationActivity(userID: string): Activity {
  return {
    type: 'event',
    name: 'startConversation',
    from: {id: userID, name: '학습자', role: 'user'},
    value: {},
  };
}

export function inferNumberedChoiceList(
  value: unknown,
  userID: string,
): InferredChoiceList | null {
  if (typeof value !== 'string') return null;
  const lines = value
    .split(/\r?\n/gu)
    .map(line => line.trim())
    .filter(Boolean);
  const choices: Array<{number: number; label: string}> = [];

  while (lines.length) {
    const match = /^(\d{1,2})[.)]\s+(.{1,60})$/u.exec(lines.at(-1) ?? '');
    if (!match) break;
    choices.unshift({number: Number(match[1]), label: match[2].trim()});
    lines.pop();
  }

  if (
    choices.length < 2 ||
    choices.length > 6 ||
    choices.some((choice, index) => choice.number !== index + 1) ||
    choices.some(choice => !choice.label || /https?:\/\//iu.test(choice.label))
  ) {
    return null;
  }

  const prompt = lines.join('\n').trim();
  if (
    !prompt ||
    !/(선택|골라|고르|몇\s*학년|어느|무엇|어떤|입력)/u.test(prompt)
  ) {
    return null;
  }

  return {
    prompt,
    actions: choices.map(choice => ({
      kind: 'message',
      label: choice.label,
      activity: {
        type: 'message',
        from: {id: userID, name: '학습자', role: 'user'},
        text: choice.label,
        locale: 'ko-KR',
      },
    })),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function toSuggestedAction(
  action: CardAction,
  userID: string,
): CopilotSuggestedAction | null {
  const label = stringValue(action.title) ?? stringValue(action.value);
  if (!label) return null;

  if (
    action.type === 'openUrl' ||
    action.type === 'signin' ||
    action.type === 'downloadFile' ||
    action.type === 'playAudio' ||
    action.type === 'playVideo' ||
    action.type === 'showImage'
  ) {
    const href = safeAttachmentUrl(action.value);
    return href ? {kind: 'link', label, href} : null;
  }

  if (action.type === 'call') return null;

  if (action.type === 'messageBack') {
    return {
      kind: 'message',
      label,
      activity: {
        type: 'message',
        from: {id: userID, name: '학습자', role: 'user'},
        text: stringValue(action.text) ?? stringValue(action.displayText) ?? label,
        value: action.value,
        locale: 'ko-KR',
      },
    };
  }

  return {
    kind: 'message',
    label,
    activity: {
      type: 'message',
      from: {id: userID, name: '학습자', role: 'user'},
      text: action.type === 'imBack' ? String(action.value) : label,
      value: action.type === 'postBack' ? action.value : undefined,
      locale: 'ko-KR',
    },
  };
}

export function safeAttachmentUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function shouldAttemptCustomWebChat(): boolean {
  return process.env.NEXT_PUBLIC_STATIC_EXPORT !== 'true';
}
