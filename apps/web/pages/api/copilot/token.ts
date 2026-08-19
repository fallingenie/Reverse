import {
  COPILOT_TOKEN_REQUEST_HEADER,
  COPILOT_TOKEN_REQUEST_HEADER_VALUE,
} from '../../../lib/copilot-webchat';
import {
  isCopilotTokenConfigured,
  requestCopilotToken,
} from '../../../lib/copilot-token.server';
import {
  sendJson,
  type VercelRequest,
  type VercelResponse,
} from '../../../lib/teacher-http.server';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, {error: 'METHOD_NOT_ALLOWED'});
    return;
  }
  if (
    request.headers[COPILOT_TOKEN_REQUEST_HEADER.toLowerCase()] !==
    COPILOT_TOKEN_REQUEST_HEADER_VALUE
  ) {
    sendJson(response, 403, {error: 'CLIENT_REJECTED'});
    return;
  }
  if (!isCopilotTokenConfigured()) {
    sendJson(response, 503, {error: 'CUSTOM_WEBCHAT_NOT_CONFIGURED'});
    return;
  }
  try {
    sendJson(response, 200, await requestCopilotToken());
  } catch {
    sendJson(response, 502, {error: 'CUSTOM_WEBCHAT_TOKEN_FAILED'});
  }
}
