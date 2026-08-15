import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const appRoot = join(import.meta.dirname, '..');
const shellSource = readFileSync(
  join(appRoot, 'components', 'copilot-experience.tsx'),
  'utf8',
);
const layoutSource = readFileSync(join(appRoot, 'app', 'layout.tsx'), 'utf8');
const themeSource = readFileSync(
  join(appRoot, 'lib', 'reverse-theme.source.ts'),
  'utf8',
);
const packageJson = JSON.parse(
  readFileSync(join(appRoot, 'package.json'), 'utf8'),
) as {dependencies: Record<string, string>};

describe('Universal Astryx 수업 셸', () => {
  it('한글 본문을 16px Noto Sans KR 체계로 고정한다', () => {
    expect(packageJson.dependencies['@fontsource-variable/noto-sans-kr']).toBe(
      '5.3.0',
    );
    expect(layoutSource).toContain("@fontsource-variable/noto-sans-kr");
    expect(themeSource).toMatch(/scale:\s*\{base:\s*16,/u);
    expect(themeSource).toMatch(/family:\s*'Noto Sans KR Variable'/u);
  });

  it('휴대전화와 태블릿을 별도 반응형 경계로 다룬다', () => {
    expect(shellSource).toContain("useMediaQuery('(max-width: 767px)')");
    expect(shellSource).toContain("useMediaQuery('(max-width: 1023px)')");
    expect(shellSource).toContain("label={isPhone ? '교사 안내' : '교사용 안내'}");
    expect(shellSource).toContain("label={isPhone ? '새 창' : '대화창만 크게 열기'}");
  });

  it('모바일 동작 영역과 대화 무대를 축소하지 않는다', () => {
    expect(shellSource).toMatch(/<Card[^>]*padding=\{3\}/u);
    expect(shellSource).toContain("padding={shellPadding}");
    expect(shellSource).toContain("style={{width: '100%', height: '100%'}}");
    expect(shellSource).toContain(
      "style={{width: '100%', height: '100%', border: 'none'}}",
    );
  });

  it('iframe 로드 이벤트를 실제 연결 성공으로 과장하지 않는다', () => {
    expect(shellSource).toContain('외부 대화 화면 로드 이벤트 수신');
    expect(shellSource).toContain('외부 화면 불러옴');
    expect(shellSource).not.toMatch(/대화창 연결됨|대화 준비됨/u);
    expect(shellSource).toContain("variant={isLoaded ? 'neutral' : 'warning'}");
  });

  it('검은 TopNav와 장문 경고 Banner를 제품 첫 화면에서 제거한다', () => {
    expect(shellSource).not.toMatch(/TopNav|<Banner/u);
    expect(shellSource).toContain('<AppShell');
    expect(shellSource).toContain("variant=\"wash\"");
    expect(shellSource).toContain('Microsoft가 제공');
    expect(shellSource).toContain('개인정보');
  });
});
