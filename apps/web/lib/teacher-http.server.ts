import type {IncomingMessage, ServerResponse} from 'node:http';
import {verifyTeacherCookie} from './teacher-auth.server';

export interface VercelRequest extends IncomingMessage {
  body?: unknown;
}

export type VercelResponse = ServerResponse;

export function sendJson(
  response: VercelResponse,
  status: number,
  body: unknown,
): void {
  response.statusCode = status;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

export function isSameOrigin(request: VercelRequest): boolean {
  const origin = request.headers.origin;
  const forwardedHost = request.headers['x-forwarded-host'];
  const host = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost ?? request.headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function isTeacherRequestAuthorized(request: VercelRequest): boolean {
  return verifyTeacherCookie(request.headers.cookie);
}
