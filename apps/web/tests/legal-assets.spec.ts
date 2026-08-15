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
});
