import {createHash} from 'node:crypto';
import {afterEach, describe, expect, it} from 'vitest';
import {
  clearTeacherSessionCookie,
  createTeacherSessionCookie,
  createTeacherSessionToken,
  isTeacherAuthConfigured,
  verifyTeacherKey,
  verifyTeacherSessionToken,
} from '../lib/teacher-auth.server.ts';
import {
  clearTeacherUnlockFailures,
  isTeacherUnlockLimited,
  registerTeacherUnlockFailure,
  resetTeacherUnlockLimiterForTests,
} from '../lib/teacher-rate-limit.server.ts';

const originalKeyHash = process.env.REVERSE_TEACHER_KEY_SHA256;
const originalSessionSecret = process.env.REVERSE_TEACHER_SESSION_SECRET;

function configureAuth(key = '교사용-테스트-키') {
  process.env.REVERSE_TEACHER_KEY_SHA256 = createHash('sha256')
    .update(key, 'utf8')
    .digest('hex');
  process.env.REVERSE_TEACHER_SESSION_SECRET = 's'.repeat(64);
  return key;
}

afterEach(() => {
  if (originalKeyHash === undefined) delete process.env.REVERSE_TEACHER_KEY_SHA256;
  else process.env.REVERSE_TEACHER_KEY_SHA256 = originalKeyHash;
  if (originalSessionSecret === undefined) delete process.env.REVERSE_TEACHER_SESSION_SECRET;
  else process.env.REVERSE_TEACHER_SESSION_SECRET = originalSessionSecret;
  resetTeacherUnlockLimiterForTests();
});

describe('교사 인증 경계', () => {
  it('환경변수가 없거나 잘못되면 닫힌 상태를 유지한다', () => {
    delete process.env.REVERSE_TEACHER_KEY_SHA256;
    delete process.env.REVERSE_TEACHER_SESSION_SECRET;
    expect(isTeacherAuthConfigured()).toBe(false);
    expect(verifyTeacherKey('anything')).toBe(false);
    expect(createTeacherSessionToken()).toBeNull();
  });

  it('서버에 저장된 SHA-256 검증값과 일치하는 키만 허용한다', () => {
    const key = configureAuth();
    expect(isTeacherAuthConfigured()).toBe(true);
    expect(verifyTeacherKey(key)).toBe(true);
    expect(verifyTeacherKey(`${key}-오류`)).toBe(false);
  });

  it('서명·만료·변조를 확인하는 짧은 세션을 만든다', () => {
    configureAuth();
    const now = Date.UTC(2026, 7, 15, 4, 0, 0);
    const token = createTeacherSessionToken(now);
    expect(token).not.toBeNull();
    expect(verifyTeacherSessionToken(token!, now + 60_000)).toBe(true);
    expect(verifyTeacherSessionToken(`${token}x`, now + 60_000)).toBe(false);
    expect(verifyTeacherSessionToken(token!, now + 16 * 60_000)).toBe(false);
  });

  it('세션 쿠키는 자바스크립트 접근과 교차 사이트 전송을 막는다', () => {
    const cookie = createTeacherSessionCookie('token');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/teacher');
    expect(clearTeacherSessionCookie()).toContain('Max-Age=0');
  });

  it('반복 실패는 잠그고 성공 후 기록을 지울 수 있다', () => {
    const identity = '198.51.100.10';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      registerTeacherUnlockFailure(identity, attempt);
    }
    expect(isTeacherUnlockLimited(identity, 5)).toBe(true);
    clearTeacherUnlockFailures(identity);
    expect(isTeacherUnlockLimited(identity, 6)).toBe(false);
  });
});
