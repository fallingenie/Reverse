import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  COPILOT_WEBCHAT_BASE_URL,
  COPILOT_WEBCHAT_URL,
} from '../lib/copilot.ts';

describe('Copilot WebChat 임베드', () => {
  it('사용자가 제공한 WebChat 경로를 그대로 사용한다', () => {
    expect(COPILOT_WEBCHAT_BASE_URL).toBe(
      'https://copilotstudio.microsoft.com/environments/9324e73a-cd4e-e049-b7ba-177af6165e9c/bots/crbf2_reverse_bmWXjU/webchat',
    );
  });

  it('교정된 세 쿼리만 사용한다', () => {
    const url = new URL(COPILOT_WEBCHAT_URL);

    expect(Object.fromEntries(url.searchParams)).toEqual({
      version: '2',
      enableFileAttachment: 'false',
      cliAgent: 'true',
    });
    expect(COPILOT_WEBCHAT_URL).not.toContain('**version**');
  });

  it('GitHub Pages에서는 Copilot 경로를 폴더 URL로 내보낸다', () => {
    const configSource = readFileSync(
      new URL('../next.config.ts', import.meta.url),
      'utf8',
    );

    expect(configSource).toContain("trailingSlash: true");
  });
});
