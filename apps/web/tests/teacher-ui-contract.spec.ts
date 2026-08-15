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
const vaultSource = readFileSync(
  new URL('../lib/teacher-vault.ts', import.meta.url),
  'utf8',
);

describe('교사 UI 배포 경계', () => {
  it('GitHub Pages 정적 빌드는 교사용 기능을 명시적으로 비활성화한다', () => {
    expect(nextConfigSource).toContain("NEXT_PUBLIC_STATIC_EXPORT: isGitHubPages ? 'true' : 'false'");
    expect(teacherSource).toContain("process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true'");
    expect(teacherSource).toContain('GitHub Pages는 정적 배포이므로');
  });

  it('키는 기능 진입 뒤 비밀번호 필드에서만 받고 브라우저 저장소에는 암호문만 쓴다', () => {
    expect(teacherSource).toContain('type="password"');
    expect(teacherSource).not.toContain('NEXT_PUBLIC_TEACHER_KEY');
    expect(vaultSource).toContain("name: 'AES-GCM'");
    expect(vaultSource).toContain("name: 'PBKDF2'");
    expect(vaultSource).not.toMatch(/localStorage|sessionStorage/u);
  });

  it('작은 화면에서도 Astryx 반응형 레이아웃을 쓰고 raw 레이아웃 태그를 만들지 않는다', () => {
    expect(teacherSource).toContain("repeat: 'fit'");
    expect(teacherSource).toContain('wrap="wrap"');
    expect(teacherSource).not.toMatch(/<(div|span)(\s|>)/u);
    expect(teacherSource).not.toContain('style={{');
  });
});
