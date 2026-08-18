import {isTeacherAuthConfigured} from '../../../lib/teacher-auth.server';
import {
  isTeacherRequestAuthorized,
  sendJson,
  type VercelRequest,
  type VercelResponse,
} from '../../../lib/teacher-http.server';

export default function handler(
  request: VercelRequest,
  response: VercelResponse,
): void {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, {error: 'METHOD_NOT_ALLOWED'});
    return;
  }
  if (!isTeacherAuthConfigured()) {
    sendJson(response, 503, {
      authorized: false,
      error: 'TEACHER_EXPORT_NOT_CONFIGURED',
    });
    return;
  }
  sendJson(response, 200, {
    authorized: isTeacherRequestAuthorized(request),
  });
}
