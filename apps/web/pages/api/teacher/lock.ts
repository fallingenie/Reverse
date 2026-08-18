import {clearTeacherSessionCookie} from '../../../lib/teacher-auth.server';
import {
  isSameOrigin,
  sendJson,
  type VercelRequest,
  type VercelResponse,
} from '../../../lib/teacher-http.server';

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
  response.setHeader('Set-Cookie', clearTeacherSessionCookie());
  sendJson(response, 200, {authorized: false});
}
