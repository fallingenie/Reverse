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

  it('첫 사용 안내에서 교사용 가이드와 보안 문서를 찾을 수 있다', async () => {
    const [startHere, webReadme, guidePage, teacherGuide] = await Promise.all([
      readFile(new URL('../../../START-HERE.md', import.meta.url), 'utf8'),
      readFile(new URL('../README.md', import.meta.url), 'utf8'),
      readFile(new URL('../app/guide/page.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../../../docs/TEACHER_GUIDE.md', import.meta.url), 'utf8'),
    ]);

    expect(startHere).toContain('docs/TEACHER_GUIDE.md');
    expect(webReadme).toContain('../../docs/TEACHER_GUIDE.md');
    expect(webReadme).toContain('../../docs/TEACHER_EXPORT_SECURITY.md');
    expect(guidePage).toContain('docs/TEACHER_GUIDE.md');
    expect(teacherGuide).toContain('TEACHER_EXPORT_SECURITY.md');
  });
});
