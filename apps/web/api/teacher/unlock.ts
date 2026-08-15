import {
  createTeacherSessionCookie,
  createTeacherSessionToken,
  isTeacherAuthConfigured,
  verifyTeacherKey,
} from '../../lib/teacher-auth.server';
import {
  isSameOrigin,
  sendJson,
  type VercelRequest,
  type VercelResponse,
} from '../../lib/teacher-http.server';
import {
  clearTeacherUnlockFailures,
  isTeacherUnlockLimited,
  registerTeacherUnlockFailure,
} from '../../lib/teacher-rate-limit.server';

function clientKey(request: VercelRequest): string {
  const forwarded = request.headers['x-vercel-forwarded-for'] ?? request.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(',')[0]?.trim() || request.socket.remoteAddress || 'unknown';
}

export default function handler(
  request: VercelRequest,
  response: VercelResponse,
): void {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, {error: 'METHOD_NOT_ALLOWED'});
    return;
  }
  if (!isSameOrigin(request)) {
    sendJson(response, 403, {error: 'ORIGIN_REJECTED'});
    return;
  }
  if (!isTeacherAuthConfigured()) {
    sendJson(response, 503, {error: 'TEACHER_EXPORT_NOT_CONFIGURED'});
    return;
  }

  const limiterKey = clientKey(request);
  if (isTeacherUnlockLimited(limiterKey)) {
    sendJson(response, 429, {error: 'TOO_MANY_ATTEMPTS'});
    return;
  }

  const body = request.body && typeof request.body === 'object'
    ? (request.body as {key?: unknown})
    : {};
  const key = typeof body.key === 'string' ? body.key : '';
  if (!verifyTeacherKey(key)) {
    registerTeacherUnlockFailure(limiterKey);
    sendJson(response, 401, {error: 'INVALID_TEACHER_KEY'});
    return;
  }

  const token = createTeacherSessionToken();
  if (!token) {
    sendJson(response, 503, {error: 'TEACHER_EXPORT_NOT_CONFIGURED'});
    return;
  }
  clearTeacherUnlockFailures(limiterKey);
  response.setHeader('Set-Cookie', createTeacherSessionCookie(token));
  sendJson(response, 200, {authorized: true});
}
