import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {basename, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  COPILOT_WEBCHAT_BASE_URL,
  COPILOT_WEBCHAT_URL,
} from '../lib/copilot.ts';

const webRoot = new URL('..', import.meta.url);

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, webRoot), 'utf8');
}

function collectSourceFilePaths(relativeDirectory: string): string[] {
  const directory = new URL(relativeDirectory, webRoot);

  if (!existsSync(directory)) return [];

  const walk = (path: string): string[] =>
    readdirSync(path).flatMap(entry => {
      const child = join(path, entry);
      return statSync(child).isDirectory()
        ? walk(child)
        : /\.(?:ts|tsx)$/u.test(entry)
          ? [child]
          : [];
    });

  return walk(fileURLToPath(directory));
}

function collectSourceFiles(relativeDirectory: string): string[] {
  return collectSourceFilePaths(relativeDirectory).map(path =>
    readFileSync(path, 'utf8'),
  );
}

const homeSource = read('app/page.tsx');
const embedSource = read('components/copilot-experience.tsx');
const nextConfigSource = read('next.config.ts');
const guidePageExists = existsSync(new URL('app/guide/page.tsx', webRoot));
const guideSource = [
  ...collectSourceFiles('app/guide/'),
  ...collectSourceFilePaths('components/')
    .filter(path => /guide/iu.test(basename(path)))
    .map(path => readFileSync(path, 'utf8')),
].join('\n');

describe('공개 제품 화면 계약', () => {
  it('루트는 Copilot 수업 화면이며 로컬 시나리오 생성기를 노출하지 않는다', () => {
    expect(homeSource).toMatch(/CopilotExperience/u);
    expect(homeSource).not.toMatch(
      /ReverseWorkspace|StudentOnboarding|buildDemoScenarios|lib\/scenarios/u,
    );
    expect(homeSource).not.toContain('시나리오 만들기');

    const routeSources = collectSourceFiles('app/').join('\n');
    expect(routeSources).not.toMatch(
      /components\/reverse-workspace|components\/student-onboarding|lib\/scenarios/u,
    );
  });

  it('사용자가 제공한 Copilot Studio WebChat 주소와 쿼리만 사용한다', () => {
    const expectedBase =
      'https://copilotstudio.microsoft.com/environments/9324e73a-cd4e-e049-b7ba-177af6165e9c/bots/crbf2_reverse_bmWXjU/webchat';
    const url = new URL(COPILOT_WEBCHAT_URL);

    expect(COPILOT_WEBCHAT_BASE_URL).toBe(expectedBase);
    expect(`${url.origin}${url.pathname}`).toBe(expectedBase);
    expect([...url.searchParams.entries()].sort()).toEqual(
      [
        ['cliAgent', 'true'],
        ['enableFileAttachment', 'false'],
        ['__version__', '2'],
      ].sort(),
    );
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('copilotstudio.microsoft.com');
  });

  it('canvas·편집기 주소와 raw HTML 삽입 경로를 공개 화면에서 차단한다', () => {
    const publicSurface = [homeSource, embedSource, guideSource].join('\n');

    expect(publicSurface).not.toMatch(/\/canvas(?:\?|[/'"`])/u);
    expect(publicSurface).not.toMatch(
      /dangerouslySetInnerHTML|\bsrcDoc\s*=|\binnerHTML\s*=|<script(?:\s|>)/u,
    );
  });

  it('iframe에 접근 가능한 제목과 보수적 referrer 정책을 지정한다', () => {
    expect(embedSource).toMatch(/<iframe[\s\S]*?title=["'{][^\n>]+/u);
    expect(embedSource).toContain('src={COPILOT_WEBCHAT_URL}');
    expect(embedSource).toContain('referrerPolicy="strict-origin-when-cross-origin"');
  });

  it('임베드가 막힐 때 같은 WebChat을 새 탭에서 여는 대체 경로를 제공한다', () => {
    expect(embedSource).toMatch(/href=\{COPILOT_WEBCHAT_URL\}/u);
    expect(embedSource).toContain('isExternalLink');
    expect(embedSource).toMatch(/새 탭|새 창/u);
  });
});

describe('GitHub Pages와 교사용 가이드 계약', () => {
  it('Pages basePath와 정적 폴더 URL을 함께 설정한다', () => {
    expect(nextConfigSource).toContain("process.env.GITHUB_PAGES === 'true'");
    expect(nextConfigSource).toMatch(/basePath[,}]/u);
    expect(nextConfigSource).toContain("output: 'export'");
    expect(nextConfigSource).toContain('trailingSlash: true');
    expect(guidePageExists).toBe(true);
    expect(embedSource).toMatch(
      /href=(?:["']\/?guide\/?["']|\{`\$\{publicBasePath\}\/guide\/`\})/u,
    );
  });

  it('컴퓨터 초심자 교사가 순서대로 따라갈 핵심 안내를 제공한다', () => {
    const requiredConcepts = [
      /처음 (?:시작|사용)|빠른 시작|사용 전 준비|설치 없이.*시작/u,
      /준비물|사용 전/u,
      /학교급|학년/u,
      /과목|단원/u,
      /Copilot Studio/u,
      /로그인|조직 계정/u,
      /수업(?:을)?\s*(?:시작|진행)|수업 화면/u,
      /문제 해결|열리지 않|접속|오류/u,
      /개인정보|학생 정보/u,
      /지원하지|할 수 없|제한/u,
    ];

    expect(guideSource.length).toBeGreaterThan(0);
    for (const concept of requiredConcepts) {
      expect(guideSource).toMatch(concept);
    }
  });

  it('외부 Copilot 콘텐츠의 보안·책임 경계를 교사에게 숨기지 않는다', () => {
    const boundarySource = `${embedSource}\n${guideSource}`;

    expect(boundarySource).toMatch(/Microsoft|Copilot Studio/u);
    expect(boundarySource).toMatch(/외부 서비스|외부 콘텐츠|iframe|임베드/u);
    expect(boundarySource).toMatch(/직접 통제하지|보장하지|Microsoft.*제공/u);
    expect(boundarySource).toMatch(/개인정보|민감정보/u);
    expect(boundarySource).toMatch(/입력하지|공유하지|주의/u);
  });
});
