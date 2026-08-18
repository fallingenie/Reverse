import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  buildTeacherExportRequest,
  createPseudonymousStudentId,
  isTeacherExportDraftValid,
} from '../lib/teacher-export.client';

const root = process.cwd();
const component = readFileSync(
  join(root, 'components', 'teacher-export-workspace.tsx'),
  'utf8',
);
const route = readFileSync(join(root, 'app', 'teacher', 'page.tsx'), 'utf8');

describe('교사용 공개 UI 회귀', () => {
  it('교차 출처 Copilot 대화 전문을 읽거나 자동 내보낸다고 주장하지 않는다', () => {
    expect(component).toContain('Copilot 대화 전문은 자동으로 가져오지 않습니다');
    expect(component).toContain('별도 출처의 iframe');
    expect(component).not.toMatch(/contentWindow|postMessage|document\.querySelector\(['"]iframe/iu);
  });

  it('교사 키와 프로파일을 브라우저 저장소에 남기지 않는다', () => {
    expect(component).not.toMatch(/localStorage|sessionStorage|indexedDB/iu);
    expect(component).toContain("setTeacherKey('')");
    expect(component).toContain("fetch('/api/teacher/unlock'");
    expect(component).toContain("fetch('/api/teacher/export'");
    expect(component).toContain("fetch('/api/teacher/lock'");
  });

  it('GitHub Pages에서는 서버 인증 기능을 fail-closed로 비활성화한다', () => {
    expect(component).toContain("process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true'");
    expect(component).toContain('GitHub Pages는 서버 인증 기능이 없는 정적 화면입니다');
  });

  it('공개 라우트는 Astryx 컴포넌트만 조합하고 로컬 수업 생성기를 연결하지 않는다', () => {
    expect(route).toContain('TeacherExportWorkspace');
    expect(component).not.toMatch(/<div\b|<span\b|className=|style=\{/u);
    expect(component).not.toMatch(/student-onboarding|lib\/scenarios|ReverseWorkspace/u);
  });

  it('가명 ID와 최소 구조화 요청을 결정적으로 생성한다', () => {
    const id = createPseudonymousStudentId(Uint8Array.from([0, 1, 2, 3, 4, 5]));
    expect(id).toBe('RVS-ABCDEF');
    const draft = {
      pseudonymousStudentId: id,
      schoolLevel: 'elementary' as const,
      grade: '5',
      subject: '과학',
      unit: '물의 상태 변화',
      includeTeacherProfile: true,
    };
    expect(isTeacherExportDraftValid(draft)).toBe(true);
    const request = buildTeacherExportRequest(draft);
    expect(request.session.transcript).toEqual([]);
    expect(request.session.started).toBe(false);
    expect(request.teacherProfile?.confirmedMisconception.status).toBe('NOT_ASSESSED');
    expect(request.teacherProfile?.pseudonymousStudentId).toBe(id);
  });
});
