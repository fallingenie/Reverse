import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

const root = new URL('../', import.meta.url);
const runtimeFiles = [
  'chatgpt/custom-gpt/INSTRUCTIONS.md',
  'copilot/studio/STUDIO_INSTRUCTIONS.md',
  'copilot/studio/GREETING_MESSAGE.md',
  'skills/teach-grounded-scenarios/prompts/01-onboarding.prompt.md',
  'skills/teach-grounded-scenarios/student-runtime/prompts/01-onboarding.prompt.md',
];
const authorLinks = [
  '[©2026 fallingenie](https://github.com/fallingenie)',
  '[© 2026 fallingenie](https://github.com/fallingenie)',
];
const upstreamLink =
  'https://github.com/lemos999/Singulari-Tea-Codex-Prompt-for-Gemini';
const noticeLink = 'https://github.com/fallingenie/Reverse';

test('학생 런타임과 Copilot 고정 인사말이 동일한 저작자·원저작자 링크를 첫 응답에 고정한다', async () => {
  for (const path of runtimeFiles) {
    const bytes = await readFile(new URL(path, root));
    const text = bytes.toString('utf8');
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], path);
    assert.equal(
      authorLinks.reduce(
        (count, authorLink) => count + text.split(authorLink).length - 1,
        0,
      ),
      1,
      path,
    );
    assert.equal(text.split(upstreamLink).length - 1, 1, path);
    assert.equal(text.split(noticeLink).length - 1, 1, path);
    if (path.endsWith('GREETING_MESSAGE.md')) {
      assert.ok(text.indexOf('© 2026 fallingenie') < text.indexOf('먼저 학교급을 선택하세요.'), path);
      assert.equal(text.split('먼저 학교급을 선택하세요.').length - 1, 1, path);
    } else {
      assert.match(text, /첫[^\n]{0,40}(학교급|응답)[^\n]{0,40}(1회|한 번)/u, path);
    }
    assert.match(text, /Apache-2\.0/u, path);
  }
});

test('플랫폼 지침은 8,000자 한도를 넘지 않는다', async () => {
  for (const path of runtimeFiles.slice(0, 2)) {
    const text = (await readFile(new URL(path, root), 'utf8')).replace(/^\uFEFF/u, '');
    assert.ok(text.length <= 8_000, `${path}: ${text.length}`);
  }
});
