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

  it('태블릿과 휴대전화에서는 짧은 내비게이션만 남긴다', () => {
    expect(shellSource).toContain("useMediaQuery('(max-width: 1023px)')");
    expect(shellSource).toContain('topNav={isCompact ? (');
    expect(shellSource).toContain('안내');
    expect(shellSource).toContain('새 창');
  });

  it('데스크톱은 안내 레일 옆에 대화 무대를 전체 높이로 채운다', () => {
    expect(shellSource).toContain('<TopNav');
    expect(shellSource).toContain('<DesktopExperienceRail />');
    expect(shellSource).toContain('width={272}');
    expect(shellSource).toContain('<Card variant="transparent" padding={3}>');
    expect(shellSource).toContain('contentPadding={0}');
    expect(shellSource).toContain('padding={0}');
    expect(shellSource).toContain("style={{width: '100%', height: '100%'}}");
    expect(shellSource).toContain(
      "style={{width: '100%', height: '100%', border: 'none'}}",
    );
  });

  it('iframe 문서 로드를 로그인이나 대화 준비 성공으로 표시하지 않는다', () => {
    expect(shellSource).toContain('isFrameDocumentLoaded');
    expect(shellSource).not.toMatch(
      /외부 화면 불러옴|대화창 연결됨|대화 준비됨|로드 이벤트 수신/u,
    );
  });

  it('대화보다 앞서는 장문 배너 없이 개인정보 경계를 분리한다', () => {
    expect(shellSource).toContain('<AppShell');
    expect(shellSource).toContain('variant="surface"');
    expect(shellSource).not.toMatch(/<Banner|<Section/u);
    expect(shellSource).toMatch(/개인정보[\s\S]*입력하지 마세요/u);
  });
});
