import {
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

export const TEACHER_SESSION_COOKIE = 'reverse_teacher_session';
export const TEACHER_SESSION_SECONDS = 15 * 60;

interface TeacherSessionPayload {
  exp: number;
  scope: 'teacher-export';
  v: 1;
}

interface TeacherAuthEnvironment {
  keyHash: string;
  sessionSecret: string;
}

function readTeacherAuthEnvironment(): TeacherAuthEnvironment | null {
  const keyHash = process.env.REVERSE_TEACHER_KEY_SHA256?.trim().toLowerCase() ?? '';
  const sessionSecret = process.env.REVERSE_TEACHER_SESSION_SECRET ?? '';

  if (!/^[a-f0-9]{64}$/u.test(keyHash) || sessionSecret.length < 32) {
    return null;
  }

  return {keyHash, sessionSecret};
}

export function isTeacherAuthConfigured(): boolean {
  return readTeacherAuthEnvironment() !== null;
}

export function verifyTeacherKey(candidate: string): boolean {
  const environment = readTeacherAuthEnvironment();
  if (!environment || !candidate || candidate.length > 256) return false;

  const actual = createHash('sha256').update(candidate, 'utf8').digest();
  const expected = Buffer.from(environment.keyHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function createTeacherSessionToken(nowMs = Date.now()): string | null {
  const environment = readTeacherAuthEnvironment();
  if (!environment) return null;

  const payload: TeacherSessionPayload = {
    exp: Math.floor(nowMs / 1000) + TEACHER_SESSION_SECONDS,
    scope: 'teacher-export',
    v: 1,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  return `${encodedPayload}.${signPayload(encodedPayload, environment.sessionSecret)}`;
}

export function verifyTeacherSessionToken(
  token: string,
  nowMs = Date.now(),
): boolean {
  const environment = readTeacherAuthEnvironment();
  if (!environment) return false;

  const [encodedPayload, suppliedSignature, extra] = token.split('.');
  if (!encodedPayload || !suppliedSignature || extra) return false;

  const expectedSignature = signPayload(
    encodedPayload,
    environment.sessionSecret,
  );
  const supplied = Buffer.from(suppliedSignature, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Partial<TeacherSessionPayload>;
    return (
      payload.v === 1 &&
      payload.scope === 'teacher-export' &&
      typeof payload.exp === 'number' &&
      payload.exp > Math.floor(nowMs / 1000)
    );
  } catch {
    return false;
  }
}

export function createTeacherSessionCookie(token: string): string {
  return [
    `${TEACHER_SESSION_COOKIE}=${token}`,
    'Path=/api/teacher',
    `Max-Age=${TEACHER_SESSION_SECONDS}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}

export function clearTeacherSessionCookie(): string {
  return [
    `${TEACHER_SESSION_COOKIE}=`,
    'Path=/api/teacher',
    'Max-Age=0',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}

export function readCookie(cookieHeader: string | undefined, name: string): string {
  if (!cookieHeader) return '';
  const item = cookieHeader
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : '';
}

export function verifyTeacherCookie(cookieHeader: string | undefined): boolean {
  return verifyTeacherSessionToken(
    readCookie(cookieHeader, TEACHER_SESSION_COOKIE),
  );
}
