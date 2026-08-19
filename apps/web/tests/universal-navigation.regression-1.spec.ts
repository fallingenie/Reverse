import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const guide = readFileSync(new URL('../app/guide/page.tsx', import.meta.url), 'utf8');
const shell = readFileSync(
  new URL('../components/copilot-experience.tsx', import.meta.url),
  'utf8',
);

describe('범용 화면 내비게이션 회귀', () => {
  it('가이드의 주요 이동 영역은 패딩이 있는 ClickableCard로 제공한다', () => {
    expect(guide).toContain("from '@astryxdesign/core/ClickableCard'");
    expect(guide.match(/<ClickableCard/gu)?.length).toBeGreaterThanOrEqual(8);
    expect(guide).toContain('padding={3}');
    expect(guide).not.toContain("from '@astryxdesign/core/Link'");
  });

  it('데스크톱은 안내 레일을 제거하고 대화 영역을 우선한다', () => {
    expect(shell).not.toContain('width={272}');
    expect(shell).not.toContain('DesktopExperienceRail');
    expect(shell).toContain('<LayoutHeader hasDivider');
    expect(shell).toContain('장면형 · 근거 기반 수업');
    expect(shell).toContain('Agent 연결됨');
  });

  it('모바일 헤더는 한 줄 고정 대신 감싸며 교사 안내와 새 창을 유지한다', () => {
    expect(shell).toContain("useMediaQuery('(max-width: 767px)')");
    expect(shell).toContain('wrap="wrap"');
    expect(shell).toContain('<Card variant="transparent" padding={3}>');
    expect(shell).toContain('교사 안내');
    expect(shell).toContain('새 창');
  });
});
