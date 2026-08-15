import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  new URL('../app/guide/page.tsx', import.meta.url),
  'utf8',
);

describe('교사용 가이드 화면', () => {
  it('설치 없는 웹 사용 경로를 가장 먼저 안내한다', () => {
    expect(source).toContain('설치 없이 수업을 시작하세요');
    expect(source).toContain('GitHub 저장소를 내려받거나 프로그램을 설치할 필요가 없습니다');
    expect(source).toContain('https://reverse-education-beta.vercel.app/');
    expect(source).toContain('https://fallingenie.github.io/Reverse/');
  });

  it('Copilot 로그인과 테넌트 경계를 숨기지 않는다', () => {
    expect(source).toContain('학교나 기관에서 허용한 업무·교육용 계정');
    expect(source).toContain('Microsoft 계정 권한, 조직의 공유 정책, Copilot Studio');
    expect(source).toContain('관리자 승인과 실제 계정 시험');
  });

  it('개인정보, 프로파일링, 교사 키의 한계를 설명한다', () => {
    expect(source).toContain('실제 학생 개인정보를 입력하지 마세요');
    expect(source).toContain('한 번의 선택으로 능력·성격·');
    expect(source).toContain('현재 공개 화면에는 교사 프로필 편집이나 Markdown 내보내기');
    expect(source).toContain('교사 키는 안전 규칙을 해제하거나');
    expect(source).toContain('/cso는 AI 보조 1차 점검이며 전문 보안감사를 대체하지 않습니다.');
  });

  it('Astryx 구성요소만 사용하고 원시 레이아웃 태그를 만들지 않는다', () => {
    expect(source).toContain("from '@astryxdesign/core/AppShell'");
    expect(source).toContain("repeat: 'fit'");
    expect(source).not.toMatch(/<(div|span)(\s|>)/u);
    expect(source).not.toContain('style={{');
  });
});
