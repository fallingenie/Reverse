import {createHash} from 'node:crypto';
import type {IncomingHttpHeaders} from 'node:http';
import {afterEach, describe, expect, it} from 'vitest';
import statusHandler from '../pages/api/teacher/status';
import unlockHandler from '../pages/api/teacher/unlock';
import lockHandler from '../pages/api/teacher/lock';
import type {
  VercelRequest,
  VercelResponse,
} from '../lib/teacher-http.server';

const originalKeyHash = process.env.REVERSE_TEACHER_KEY_SHA256;
const originalSecret = process.env.REVERSE_TEACHER_SESSION_SECRET;

function restoreEnvironment() {
  if (originalKeyHash === undefined) delete process.env.REVERSE_TEACHER_KEY_SHA256;
  else process.env.REVERSE_TEACHER_KEY_SHA256 = originalKeyHash;
  if (originalSecret === undefined) delete process.env.REVERSE_TEACHER_SESSION_SECRET;
  else process.env.REVERSE_TEACHER_SESSION_SECRET = originalSecret;
}

function invoke(
  handler: (request: VercelRequest, response: VercelResponse) => void,
  input: {
    method: string;
    headers?: IncomingHttpHeaders;
    body?: unknown;
  },
) {
  const responseHeaders = new Map<string, string>();
  let responseBody = '';
  const request = {
    method: input.method,
    headers: input.headers ?? {},
    body: input.body,
    socket: {remoteAddress: '127.0.0.1'},
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
  handler(request, response);
  return {
    status: response.statusCode,
    headers: responseHeaders,
    json: () => JSON.parse(responseBody) as unknown,
  };
}

afterEach(restoreEnvironment);

describe('Next Pages API 교사 경로 회귀', () => {
  it('상태 API는 설정 없음과 잠긴 상태를 JSON으로 구분한다', () => {
    delete process.env.REVERSE_TEACHER_KEY_SHA256;
    delete process.env.REVERSE_TEACHER_SESSION_SECRET;
    const unconfigured = invoke(statusHandler, {method: 'GET'});
    expect(unconfigured.status).toBe(503);
    expect(unconfigured.json()).toEqual({
      authorized: false,
      error: 'TEACHER_EXPORT_NOT_CONFIGURED',
    });

    process.env.REVERSE_TEACHER_KEY_SHA256 = createHash('sha256')
      .update('test-key', 'utf8')
      .digest('hex');
    process.env.REVERSE_TEACHER_SESSION_SECRET = 's'.repeat(64);
    const configured = invoke(statusHandler, {method: 'GET'});
    expect(configured.status).toBe(200);
    expect(configured.json()).toEqual({authorized: false});
  });

  it('같은 출처의 올바른 키만 HttpOnly 세션을 만들고 잠글 수 있다', () => {
    const key = 'test-key';
    process.env.REVERSE_TEACHER_KEY_SHA256 = createHash('sha256')
      .update(key, 'utf8')
      .digest('hex');
    process.env.REVERSE_TEACHER_SESSION_SECRET = 's'.repeat(64);
    const headers = {
      host: 'example.test',
      origin: 'https://example.test',
    };
    const unlocked = invoke(unlockHandler, {
      method: 'POST',
      headers,
      body: {key},
    });
    expect(unlocked.status).toBe(200);
    const cookie = unlocked.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');

    const locked = invoke(lockHandler, {
      method: 'POST',
      headers: {...headers, cookie},
    });
    expect(locked.status).toBe(200);
    expect(locked.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('교차 출처 잠금 해제는 키가 맞아도 거부한다', () => {
    const key = 'test-key';
    process.env.REVERSE_TEACHER_KEY_SHA256 = createHash('sha256')
      .update(key, 'utf8')
      .digest('hex');
    process.env.REVERSE_TEACHER_SESSION_SECRET = 's'.repeat(64);
    const response = invoke(unlockHandler, {
      method: 'POST',
      headers: {
        host: 'example.test',
        origin: 'https://attacker.test',
      },
      body: {key},
    });
    expect(response.status).toBe(403);
    expect(response.json()).toEqual({error: 'ORIGIN_REJECTED'});
  });
});
