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

  it('데스크톱 안내 레일은 한글 용어와 읽기 좋은 폭을 사용한다', () => {
    expect(shell).toContain('width={272}');
    expect(shell).toContain('선택은 이야기를 움직이고, 근거는 수업을 지탱합니다.');
    expect(shell).toContain('수업 에이전트를 이 화면에서 바로');
    expect(shell).not.toMatch(/수업 Agent/u);
  });

  it('모바일 내비게이션은 이미 패딩이 있는 Astryx 액션 표면을 유지한다', () => {
    expect(shell).toContain('<CompactNavigationLink');
    expect(shell).toContain('<Card variant="transparent" padding={3}>');
  });
});
