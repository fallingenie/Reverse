import {readFileSync} from 'node:fs';
import type {IncomingHttpHeaders} from 'node:http';
import {afterEach, describe, expect, it} from 'vitest';
import type {Activity} from 'botframework-directlinejs';
import tokenHandler from '../pages/api/copilot/token';
import {
  COPILOT_TOKEN_REQUEST_HEADER,
  COPILOT_TOKEN_REQUEST_HEADER_VALUE,
  WEBCHAT_TYPING_DELAY_MS,
  WEBCHAT_TYPING_TIMEOUT_MS,
  advanceQuickProfile,
  createChoiceActions,
  createStartConversationActivity,
  ensureInitialAgentAttribution,
  gradeChoicesForSchool,
  inferNumberedChoiceList,
  isOwnActivity,
  isStartConversationEcho,
  safeAttachmentUrl,
  shouldAttemptCustomWebChat,
  shouldStartQuickProfile,
  toSuggestedAction,
  visibleChatViewportHeight,
} from '../lib/copilot-webchat';
import {
  COPILOT_PUBLIC_TOKEN_ENDPOINT,
  isCopilotTokenConfigured,
  normalizeDirectLineDomain,
  requestCopilotToken,
} from '../lib/copilot-token.server';
import type {
  VercelRequest,
  VercelResponse,
} from '../lib/teacher-http.server';

const originalEndpoint = process.env.COPILOT_STUDIO_TOKEN_ENDPOINT;
const originalSecret = process.env.COPILOT_DIRECT_LINE_SECRET;
const originalDomain = process.env.COPILOT_DIRECT_LINE_DOMAIN;
const originalStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT;

function restoreEnvironment() {
  for (const [name, value] of [
    ['COPILOT_STUDIO_TOKEN_ENDPOINT', originalEndpoint],
    ['COPILOT_DIRECT_LINE_SECRET', originalSecret],
    ['COPILOT_DIRECT_LINE_DOMAIN', originalDomain],
    ['NEXT_PUBLIC_STATIC_EXPORT', originalStaticExport],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

async function invokeTokenHandler(input: {
  method: string;
  headers?: IncomingHttpHeaders;
}) {
  const responseHeaders = new Map<string, string>();
  let responseBody = '';
  const request = {
    method: input.method,
    headers: input.headers ?? {},
  } as unknown as VercelRequest;
  const response = {
    statusCode: 200,
    setHeader(name: string, value: string | number | readonly string[]) {
      responseHeaders.set(
        name.toLowerCase(),
        Array.isArray(value) ? value.join(', ') : String(value),
      );
      return this;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) responseBody = String(chunk);
      return this;
    },
  } as unknown as VercelResponse;
  await tokenHandler(request, response);
  return {
    status: response.statusCode,
    headers: responseHeaders,
    json: () => JSON.parse(responseBody) as unknown,
  };
}

afterEach(restoreEnvironment);

describe('Astryx Custom Web Chat 표시 계약', () => {
  it('첫 학교급 질문 앞에 저작자·원저작자 링크를 정확히 한 번 고정한다', () => {
    const prompt = '수업을 시작합니다.\n먼저 학교급을 선택하세요.';
    const attributed = ensureInitialAgentAttribution(prompt);

    expect(attributed).toContain(
      '[© 2026 fallingenie](https://github.com/fallingenie)',
    );
    expect(attributed).toContain(
      '[Singulari-Tea Codex © 2025 fewweekslater (lemos999)](https://github.com/lemos999/Singulari-Tea-Codex-Prompt-for-Gemini)',
    );
    expect(attributed).toContain(
      '[LICENSE/NOTICE](https://github.com/fallingenie/Reverse)',
    );
    expect(attributed.indexOf('Reverse [© 2026 fallingenie]')).toBeLessThan(
      attributed.indexOf('먼저 학교급을 선택하세요.'),
    );
    expect(ensureInitialAgentAttribution(attributed)).toBe(attributed);
    expect(attributed.match(/Reverse \[© 2026 fallingenie\]/gu)).toHaveLength(1);
  });

  it('연결 직후 시작 토픽을 여는 표준 event를 한 번 보낼 수 있다', () => {
    expect(createStartConversationActivity('student-a')).toEqual({
      type: 'event',
      name: 'startConversation',
      from: {id: 'student-a', name: '학습자', role: 'user'},
      value: {},
    });
  });

  it('Direct Line이 바꾼 사용자 ID의 되돌림을 Reverse 답변으로 오인하지 않는다', () => {
    const echo = {
      type: 'event',
      name: 'startConversation',
      from: {id: 'relayed-user'},
    } as Activity;
    const relayedMessage = {
      type: 'message',
      from: {id: 'relayed-user'},
      text: '3학년',
    } as Activity;
    const botMessage = {
      type: 'message',
      from: {id: 'reverse-agent'},
      text: '과목을 골라 주세요.',
    } as Activity;

    expect(isStartConversationEcho(echo, 'local-user')).toBe(true);
    expect(isOwnActivity(relayedMessage, 'local-user', 'relayed-user')).toBe(true);
    expect(isOwnActivity(botMessage, 'local-user', 'relayed-user')).toBe(false);
  });

  it('고정 프로필은 학교급과 학년 선택 중에는 호출하지 않고 과목 뒤 한 번만 합친다', () => {
    const schoolActions = createChoiceActions(
      ['초등학교', '중학교', '고등학교'],
      'student-a',
    );
    expect(
      shouldStartQuickProfile('먼저 학교급을 선택하세요.', schoolActions),
    ).toBe(true);

    const grade = advanceQuickProfile({stage: 'school'}, '초등학교');
    expect(grade).toEqual(
      expect.objectContaining({
        state: {stage: 'grade', schoolLevel: '초등학교'},
        prompt: '몇 학년인가요?',
        choices: ['3학년', '4학년', '5학년', '6학년'],
      }),
    );
    expect(grade?.outboundText).toBeUndefined();

    const subject = advanceQuickProfile(grade!.state, '3학년');
    expect(subject).toEqual(
      expect.objectContaining({
        state: {stage: 'subject', schoolLevel: '초등학교', grade: '3학년'},
        prompt: '과목을 골라 주세요.',
      }),
    );
    expect(subject?.outboundText).toBeUndefined();

    const unit = advanceQuickProfile(subject!.state, '수학');
    expect(unit).toEqual({
      state: {
        stage: 'unit',
        schoolLevel: '초등학교',
        grade: '3학년',
        subject: '수학',
      },
      prompt:
        '교과서에 적힌 현재 단원명을 그대로 입력해 주세요. 모르면 “모르겠다”라고 입력해도 됩니다.',
      choices: [],
    });
    expect(unit!.outboundText).toBeUndefined();

    expect(advanceQuickProfile(unit!.state, '분수의 덧셈과 뺄셈')).toEqual({
      state: {stage: 'inactive'},
      choices: [],
      outboundText: '초등학교 3학년 수학, 단원: 분수의 덧셈과 뺄셈',
    });
  });

  it('학교급별 지원 학년과 직접 입력 과목을 보수적으로 처리한다', () => {
    expect(gradeChoicesForSchool('중학교')).toEqual([
      '1학년',
      '2학년',
      '3학년',
    ]);
    expect(gradeChoicesForSchool('고등학교')).toEqual(['1학년', '2학년']);

    const custom = advanceQuickProfile(
      {stage: 'subject', schoolLevel: '중학교', grade: '3학년'},
      '기타·직접 입력',
    );
    expect(custom?.state).toEqual({
      stage: 'custom-subject',
      schoolLevel: '중학교',
      grade: '3학년',
    });
    const unit = advanceQuickProfile(custom!.state, '정보');
    expect(unit?.state).toEqual({
      stage: 'unit',
      schoolLevel: '중학교',
      grade: '3학년',
      subject: '정보',
    });
    expect(advanceQuickProfile(unit!.state, '자료와 정보')?.outboundText).toBe(
      '중학교 3학년 정보, 단원: 자료와 정보',
    );
    expect(advanceQuickProfile({stage: 'school'}, '3.5학년')).toBeNull();
  });

  it('짧은 응답에는 로딩 표시를 만들지 않고 무한 대기를 제한한다', () => {
    expect(WEBCHAT_TYPING_DELAY_MS).toBeGreaterThanOrEqual(500);
    expect(WEBCHAT_TYPING_TIMEOUT_MS).toBeLessThanOrEqual(30000);
    expect(WEBCHAT_TYPING_TIMEOUT_MS).toBeGreaterThan(WEBCHAT_TYPING_DELAY_MS);
  });

  it('모바일 키보드가 열린 실제 가시 영역만 대화 높이로 사용한다', () => {
    expect(
      visibleChatViewportHeight({height: 500, offsetTop: 0}, 84),
    ).toBe(416);
    expect(
      visibleChatViewportHeight({height: 420, offsetTop: 280}, -40),
    ).toBe(420);
    expect(
      visibleChatViewportHeight({height: Number.NaN, offsetTop: 0}, 84),
    ).toBeNull();
  });

  it('선택지는 고정 입력창이 아니라 대화 스크롤 영역 안에 둔다', () => {
    const source = readFileSync(
      new URL('../components/custom-copilot-chat.tsx', import.meta.url),
      'utf8',
    );
    const messageListStart = source.indexOf('<ChatMessageList');
    const messageListEnd = source.indexOf('</ChatMessageList>');
    const actionList = source.indexOf('aria-label="Reverse가 제시한 선택지"');
    const composerStart = source.indexOf('composer={');

    expect(messageListStart).toBeGreaterThan(-1);
    expect(messageListEnd).toBeGreaterThan(messageListStart);
    expect(actionList).toBeGreaterThan(messageListStart);
    expect(actionList).toBeLessThan(messageListEnd);
    expect(source.slice(composerStart, messageListStart)).not.toContain(
      'Reverse가 제시한 선택지',
    );
    expect(source).toContain('window.visualViewport');
    expect(source).toContain("scrollIntoView({block: 'nearest'");
  });

  it('모바일 브라우저 키보드는 콘텐츠 영역을 줄이도록 선언한다', () => {
    const layoutSource = readFileSync(
      new URL('../app/layout.tsx', import.meta.url),
      'utf8',
    );
    expect(layoutSource).toContain("interactiveWidget: 'resizes-content'");
    expect(layoutSource).toContain("viewportFit: 'cover'");
  });

  it('짧은 번호형 학년 선택지는 큰 메시지 버튼으로 추론한다', () => {
    const inferred = inferNumberedChoiceList(
      '몇 학년인가요?\n\n1. 3학년\n2. 4학년\n3. 5학년\n4. 6학년',
      'student-a',
    );
    expect(inferred?.prompt).toBe('몇 학년인가요?');
    expect(inferred?.actions.map(action => action.label)).toEqual([
      '3학년',
      '4학년',
      '5학년',
      '6학년',
    ]);
    expect(inferred?.actions[0]?.activity.text).toBe('3학년');
  });

  it('설명용 번호 목록과 URL 목록은 선택 버튼으로 오인하지 않는다', () => {
    expect(
      inferNumberedChoiceList('주의사항\n1. 개인정보를 넣지 않기\n2. 출처 확인하기', 'a'),
    ).toBeNull();
    expect(
      inferNumberedChoiceList(
        '자료를 골라 주세요.\n1. https://example.test/one\n2. 안전한 자료',
        'a',
      ),
    ).toBeNull();
  });

  it('제안 행동을 학습자 발화로 변환하고 사용자 ID를 분리한다', () => {
    expect(
      toSuggestedAction(
        {type: 'imBack', title: '3학년', value: '3학년'},
        'student-a',
      ),
    ).toEqual({
      kind: 'message',
      label: '3학년',
      activity: expect.objectContaining({
        text: '3학년',
        from: expect.objectContaining({id: 'student-a', role: 'user'}),
      }),
    });
  });

  it('로그인과 외부 자료 행동은 HTTPS 링크로만 분리한다', () => {
    expect(
      toSuggestedAction(
        {type: 'signin', title: '로그인', value: 'https://login.example.test/'},
        'student-a',
      ),
    ).toEqual({
      kind: 'link',
      label: '로그인',
      href: 'https://login.example.test/',
    });
    expect(
      toSuggestedAction(
        {type: 'openUrl', title: '열기', value: 'javascript:alert(1)'},
        'student-a',
      ),
    ).toBeNull();
  });

  it('첨부 자료 URL은 HTTPS만 표시한다', () => {
    expect(safeAttachmentUrl('https://example.test/file.png')).toBe(
      'https://example.test/file.png',
    );
    expect(safeAttachmentUrl('javascript:alert(1)')).toBeNull();
    expect(safeAttachmentUrl('http://example.test/file.png')).toBeNull();
  });

  it('서버가 없는 Pages에서는 Custom Web Chat을 시도하지 않는다', () => {
    process.env.NEXT_PUBLIC_STATIC_EXPORT = 'true';
    expect(shouldAttemptCustomWebChat()).toBe(false);
    process.env.NEXT_PUBLIC_STATIC_EXPORT = 'false';
    expect(shouldAttemptCustomWebChat()).toBe(true);
  });

  it('브라우저 소스에는 Direct Line 비밀 환경변수가 들어가지 않는다', () => {
    const clientSource = [
      readFileSync(
        new URL('../components/custom-copilot-chat.tsx', import.meta.url),
        'utf8',
      ),
      readFileSync(
        new URL('../components/copilot-experience.tsx', import.meta.url),
        'utf8',
      ),
      readFileSync(new URL('../lib/copilot-webchat.ts', import.meta.url), 'utf8'),
    ].join('\n');

    expect(clientSource).not.toContain('COPILOT_DIRECT_LINE_SECRET');
    expect(clientSource).not.toContain('COPILOT_STUDIO_TOKEN_ENDPOINT');
    expect(clientSource).toContain('/api/copilot/token');
    expect(clientSource).toContain('@astryxdesign/core/Chat');
    expect(clientSource).toContain('size="lg"');
    expect(clientSource).toContain('width="100%"');
    expect(clientSource).not.toContain('botframework-webchat');
    expect(clientSource).not.toMatch(/<div\b|<span\b/iu);
  });
});

describe('Copilot 토큰 중계 경계', () => {
  it('Direct Line 도메인을 HTTPS v3 경로로 정규화한다', () => {
    expect(normalizeDirectLineDomain()).toBe(
      'https://directline.botframework.com/v3/directline',
    );
    expect(normalizeDirectLineDomain('https://europe.directline.botframework.com/')).toBe(
      'https://europe.directline.botframework.com/v3/directline',
    );
    expect(() => normalizeDirectLineDomain('http://example.test')).toThrow(
      'DIRECT_LINE_DOMAIN_INVALID',
    );
  });

  it('서버 전용 비밀로 토큰을 교환하고 비밀은 응답에 넣지 않는다', async () => {
    delete process.env.COPILOT_STUDIO_TOKEN_ENDPOINT;
    process.env.COPILOT_DIRECT_LINE_SECRET = 'server-only-secret';
    const calls: Array<{input: string; authorization: string | null}> = [];
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({
        input: String(input),
        authorization: headers.get('Authorization'),
      });
      return Response.json({token: 'ephemeral-token', expires_in: 1800});
    }) as typeof fetch;

    const result = await requestCopilotToken(fetcher);

    expect(calls).toEqual([
      {
        input:
          'https://directline.botframework.com/v3/directline/tokens/generate',
        authorization: 'Bearer server-only-secret',
      },
    ]);
    expect(result).toEqual({
      token: 'ephemeral-token',
      domain: 'https://directline.botframework.com/v3/directline',
      expiresIn: 1800,
    });
    expect(JSON.stringify(result)).not.toContain('server-only-secret');
  });

  it('수동 설정이 없어도 검증된 공개 Agent 토큰 경로를 사용한다', async () => {
    delete process.env.COPILOT_STUDIO_TOKEN_ENDPOINT;
    delete process.env.COPILOT_DIRECT_LINE_SECRET;
    delete process.env.COPILOT_DIRECT_LINE_DOMAIN;

    const calls: Array<{input: string; method: string}> = [];
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({input: String(input), method: init?.method ?? 'GET'});
      return Response.json({token: 'public-ephemeral-token', expires_in: 1800});
    }) as typeof fetch;

    expect(isCopilotTokenConfigured()).toBe(true);
    expect(COPILOT_PUBLIC_TOKEN_ENDPOINT).toBe(
      'https://9324e73acd4ee049b7ba177af6165e.9c.environment.api.powerplatform.com/copilotstudio/agenticruntime/botsbyschema/crbf2_reverse_bmWXjU/directline/token?api-version=2022-03-01-preview',
    );
    await expect(requestCopilotToken(fetcher)).resolves.toEqual({
      token: 'public-ephemeral-token',
      domain: 'https://directline.botframework.com/v3/directline',
      expiresIn: 1800,
    });
    expect(calls).toEqual([
      {input: COPILOT_PUBLIC_TOKEN_ENDPOINT, method: 'GET'},
    ]);
  });

  it('잘못된 호출과 충돌한 서버 설정을 fail-closed로 거부한다', async () => {
    delete process.env.COPILOT_STUDIO_TOKEN_ENDPOINT;
    delete process.env.COPILOT_DIRECT_LINE_SECRET;

    const rejectedClient = await invokeTokenHandler({method: 'GET'});
    expect(rejectedClient.status).toBe(403);
    expect(rejectedClient.json()).toEqual({error: 'CLIENT_REJECTED'});

    process.env.COPILOT_STUDIO_TOKEN_ENDPOINT = 'https://example.test/token';
    process.env.COPILOT_DIRECT_LINE_SECRET = 'conflicting-secret';
    const invalidConfiguration = await invokeTokenHandler({
      method: 'GET',
      headers: {
        [COPILOT_TOKEN_REQUEST_HEADER.toLowerCase()]:
          COPILOT_TOKEN_REQUEST_HEADER_VALUE,
      },
    });
    expect(invalidConfiguration.status).toBe(503);
    expect(invalidConfiguration.headers.get('cache-control')).toBe('no-store');
    expect(invalidConfiguration.json()).toEqual({
      error: 'CUSTOM_WEBCHAT_NOT_CONFIGURED',
    });
  });
});
