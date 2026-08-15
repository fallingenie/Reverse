import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {COPILOT_WEBCHAT_URL} from '../lib/copilot.ts';

const webRoot = new URL('..', import.meta.url);
const repositoryRoot = new URL('../../..', import.meta.url);

function readWeb(relativePath: string): string {
  return readFileSync(new URL(relativePath, webRoot), 'utf8');
}

function readRepository(relativePath: string): string {
  return readFileSync(new URL(relativePath, repositoryRoot), 'utf8');
}

describe('GitHub Pages 배포 계약', () => {
  const nextConfigSource = readWeb('next.config.ts');
  const ciWorkflowSource = readRepository('.github/workflows/ci.yml');
  const pagesWorkflowSource = readRepository('.github/workflows/pages.yml');

  it('저장소 이름에서 Pages 하위 경로와 정적 자산 경로를 함께 계산한다', () => {
    expect(nextConfigSource).toContain(
      "process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'Reverse'",
    );
    expect(nextConfigSource).toContain('NEXT_PUBLIC_BASE_PATH: basePath');
    expect(nextConfigSource).toContain('assetPrefix: basePath');
    expect(nextConfigSource).toContain('basePath,');
    expect(nextConfigSource).toContain("output: 'export'");
    expect(nextConfigSource).toContain('trailingSlash: true');
  });

  it('Pages 작업은 웹 앱을 검사한 뒤 정적 산출물만 게시한다', () => {
    expect(pagesWorkflowSource).toContain('working-directory: apps/web');
    expect(pagesWorkflowSource).toContain("GITHUB_PAGES: 'true'");
    expect(pagesWorkflowSource).toContain('run: pnpm run check');
    expect(pagesWorkflowSource).toContain('path: apps/web/out');
    expect(pagesWorkflowSource).toContain('actions/deploy-pages@');
    expect(pagesWorkflowSource).not.toContain('NEXT_PUBLIC_BASE_PATH: /Reverse');
  });

  it('PR 단계에서도 공개 웹 화면을 검사해 깨진 루트나 가이드를 병합하지 않는다', () => {
    expect(ciWorkflowSource).toContain('web-surface:');
    expect(ciWorkflowSource).toContain('cache-dependency-path: apps/web/pnpm-lock.yaml');
    expect(ciWorkflowSource).toContain('working-directory: apps/web');
    expect(ciWorkflowSource).toContain('run: pnpm run check');
    expect(ciWorkflowSource).toContain('Verify GitHub Pages export');
    expect(ciWorkflowSource).toContain("GITHUB_PAGES: 'true'");
  });
});

describe('Vercel과 WebChat 경계 계약', () => {
  const vercelConfig = JSON.parse(readWeb('vercel.json')) as {
    framework?: string;
    installCommand?: string;
    buildCommand?: string;
  };

  it('apps/web을 일반 Next.js 프로젝트로 배포한다', () => {
    expect(vercelConfig).toEqual(
      expect.objectContaining({
        framework: 'nextjs',
        installCommand: 'pnpm install --frozen-lockfile',
        buildCommand: 'pnpm run build',
      }),
    );
  });

  it('공개 iframe 주소에 비밀값이나 배포 환경변수를 요구하지 않는다', () => {
    const url = new URL(COPILOT_WEBCHAT_URL);

    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('copilotstudio.microsoft.com');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      __version__: '2',
      enableFileAttachment: 'false',
      cliAgent: 'true',
    });
    expect(COPILOT_WEBCHAT_URL).not.toMatch(
      /(?:token|secret|key|password|NEXT_PUBLIC|process\.env)/iu,
    );
  });
});
