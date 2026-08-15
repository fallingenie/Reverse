import {buildTeacherMarkdownExport} from '../../lib/teacher-export.server';
import {
  isSameOrigin,
  isTeacherRequestAuthorized,
  sendJson,
  type VercelRequest,
  type VercelResponse,
} from '../../lib/teacher-http.server';

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
  if (!isTeacherRequestAuthorized(request)) {
    sendJson(response, 401, {error: 'TEACHER_SESSION_REQUIRED'});
    return;
  }

  try {
    const result = buildTeacherMarkdownExport(request.body, new Date());
    sendJson(response, 200, result);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INVALID_EXPORT';
    sendJson(response, code === 'EXPORT_TOO_LARGE' ? 413 : 400, {error: code});
  }
}
