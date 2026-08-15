import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const teacherSource = readFileSync(
  new URL('../components/teacher-review.tsx', import.meta.url),
  'utf8',
);
const nextConfigSource = readFileSync(
  new URL('../next.config.ts', import.meta.url),
  'utf8',
);
describe('교사 UI 배포 경계', () => {
  it('GitHub Pages 정적 빌드는 교사용 기능을 명시적으로 비활성화한다', () => {
    expect(nextConfigSource).toContain("NEXT_PUBLIC_STATIC_EXPORT: isGitHubPages ? 'true' : 'false'");
    expect(teacherSource).toContain("process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true'");
    expect(teacherSource).toContain('GitHub Pages는 정적 배포이므로');
  });

  it('키는 기능 진입 뒤 비밀번호 필드에서만 받고 프로파일을 지속 저장하지 않는다', () => {
    expect(teacherSource).toContain('type="password"');
    expect(teacherSource).not.toContain('NEXT_PUBLIC_TEACHER_KEY');
    expect(teacherSource).not.toMatch(/localStorage|sessionStorage|teacher-vault/u);
    expect(teacherSource).toContain('브라우저 메모리에만');
    expect(teacherSource).toContain('세션이 만료되었습니다');
  });

  it('작은 화면에서도 Astryx 반응형 레이아웃을 쓰고 raw 레이아웃 태그를 만들지 않는다', () => {
    expect(teacherSource).toContain("repeat: 'fit'");
    expect(teacherSource).toContain('wrap="wrap"');
    expect(teacherSource).not.toMatch(/<(div|span)(\s|>)/u);
    expect(teacherSource).not.toContain('style={{');
  });

  it('프로파일은 구조화된 선택 사건과 미평가만 허용한다', () => {
    expect(teacherSource).toContain('선택한 시나리오 활동');
    expect(teacherSource).toContain('선택한 행동 활동');
    expect(teacherSource).toContain('자유입력 원문은 프로파일이나 내보내기에 넣지 않습니다');
    expect(teacherSource).toContain('구조화된 선택 사건과');
    expect(teacherSource).toContain('확인 필요·미평가');
    expect(teacherSource).toContain('교사 자유 메모');
    expect(teacherSource).toContain('현재 베타에서 비활성화');
    expect(teacherSource).not.toContain('판단 상태');
    expect(teacherSource).not.toContain('근거 ID를 쉼표');
    expect(teacherSource).toContain('Agent가 제안한 기본 행동 수락');
    expect(teacherSource).toContain('잠정 패턴이나 평가 완료를 기록할 수 없습니다');
    expect(teacherSource).toContain("unit: session.unit.trim() ? 'entered' : ''");
    expect(teacherSource).toContain('transcript: []');
  });
});
