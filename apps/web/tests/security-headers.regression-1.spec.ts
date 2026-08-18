import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

// Regression: ISSUE-003 — 공개 Vercel 응답에 방어 헤더가 없었습니다.
// Found by /qa on 2026-08-18
// Report: .gstack/qa-reports/qa-report-reverse-education-beta-vercel-app-2026-08-18.md

const config = JSON.parse(
  readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
) as {
  headers?: Array<{
    source?: string;
    headers?: Array<{key?: string; value?: string}>;
  }>;
};

const responseHeaders = new Map(
  config.headers?.flatMap(rule => rule.headers ?? []).map(header => [
    header.key,
    header.value,
  ]),
);

describe('Vercel 공개 응답 보안 경계', () => {
  it('모든 공개 경로에 기본 방어 헤더를 적용한다', () => {
    expect(config.headers?.[0]?.source).toBe('/(.*)');
    expect(responseHeaders.get('X-Content-Type-Options')).toBe('nosniff');
    expect(responseHeaders.get('X-Frame-Options')).toBe('DENY');
    expect(responseHeaders.get('Referrer-Policy')).toBe(
      'strict-origin-when-cross-origin',
    );
    expect(responseHeaders.get('Permissions-Policy')).toContain('camera=()');
  });

  it('CSP는 Copilot WebChat만 frame 대상으로 허용한다', () => {
    const policy = responseHeaders.get('Content-Security-Policy') ?? '';
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain(
      'frame-src https://copilotstudio.microsoft.com',
    );
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toMatch(/frame-src\s+\*/u);
    expect(policy).not.toContain('http:');
  });
});
