import {readFile} from 'node:fs/promises';
import {describe, expect, it} from 'vitest';

describe('배포 법적 문서', () => {
  it.each(['LICENSE', 'NOTICE'])('%s 공개 파일이 루트 원문과 바이트 단위로 같다', async fileName => {
    const [rootDocument, publicDocument] = await Promise.all([
      readFile(new URL(`../${fileName}`, import.meta.url)),
      readFile(new URL(`../public/${fileName}`, import.meta.url)),
    ]);

    expect(publicDocument.equals(rootDocument)).toBe(true);
  });

  it('첫 화면이 터미널 실행과 Custom GPT 수동 구성을 구분한다', async () => {
    const source = await readFile(
      new URL('../components/reverse-workspace.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('git clone https://github.com/fallingenie/Reverse.git');
    expect(source).toContain('pnpm install --frozen-lockfile');
    expect(source).toContain('pnpm dev');
    expect(source).toContain('Codex 또는');
    expect(source).toContain('일반 ChatGPT와 Custom GPT 대화창은');
    expect(source).toContain('셸 명령을 실행하지 못합니다');
    expect(source).toContain('Codex·터미널에서 로컬 웹 데모 실행');
    expect(source).toContain('Custom GPT 구성표 열기');
    expect(source).toContain('blob/main/chatgpt/custom-gpt/BUILDER_CONFIG.md');
    expect(source).toContain('https://vercel.com/new/clone?');
    expect(source).toContain('초보자 빠른 시작');
    expect(source).toContain('Copilot 설치 안내');
    expect(source).not.toContain('blob/agent/runtime-profiles/');
    expect(source.match(/hasUnderline/g)?.length).toBeGreaterThanOrEqual(10);
    expect(source).toContain('Vercel 배포');
    expect(source).toContain('Pages 배포 상태');
  });
});
