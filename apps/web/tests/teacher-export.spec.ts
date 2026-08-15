import {describe, expect, it} from 'vitest';
import {INITIAL_SESSION} from '../lib/session.ts';
import {
  buildTeacherMarkdownExport,
  escapeMarkdownInline,
  parseTeacherExportRequest,
} from '../lib/teacher-export.server.ts';
import {
  encodeMarkdownWithUtf8Bom,
  type TeacherExportRequest,
  type TeacherStudentProfile,
} from '../lib/teacher-records.ts';

const generatedAt = '2026-08-15T04:00:00.000Z';
const profile: TeacherStudentProfile = {
  pseudonymousStudentId: '별빛-07',
  gradeAndUnit: {value: '초등학교 6학년 · 분수', provenance: 'STUDENT_STATED'},
  explicitInterest: {value: '우주', provenance: 'STUDENT_STATED'},
  supportPreference: {value: '그림 힌트', provenance: 'STUDENT_STATED'},
  confirmedMisconception: {
    value: '분모끼리 더한다고 답함',
    provenance: 'TEACHER_OBSERVED',
  },
  misconceptionEvidence: {
    value: '학생 답변 1/2 + 1/3 = 2/5',
    provenance: 'TEACHER_OBSERVED',
  },
  teacherNote: {value: '다음 시간에 모형 사용', provenance: 'TEACHER_OBSERVED'},
  updatedAt: generatedAt,
};

function request(includeTeacherProfile: boolean): TeacherExportRequest {
  return {
    generatedAt,
    pseudonymousStudentId: profile.pseudonymousStudentId,
    session: {
      ...INITIAL_SESSION,
      schoolLevel: 'elementary',
      grade: '6',
      subject: '수학',
      unit: '분수의 덧셈과 뺄셈',
      transcript: [
        {actor: 'student', text: '저는 **우주**가 좋아요'},
        {
          actor: 'simulator',
          text: '<script>alert(1)</script> 장면은 수업용입니다.',
          epistemicStatus: 'ASSUMPTION',
        },
        {
          actor: 'simulator',
          text: '# 확인되지 않은 결론',
          epistemicStatus: 'UNKNOWN',
        },
      ],
    },
    includeTeacherProfile,
    teacherProfile: includeTeacherProfile ? profile : undefined,
  };
}

describe('교사용 Markdown 내보내기', () => {
  it('같은 입력은 같은 파일명·본문·해시를 만든다', () => {
    const first = buildTeacherMarkdownExport(request(false));
    const second = buildTeacherMarkdownExport(request(false));
    expect(first).toEqual(second);
    expect(first.filename).toBe('reverse-session-20260815T040000Z-4e5a16b3.md');
    expect(first.markdown).toContain(`<!-- sha256:${first.sha256} -->`);
  });

  it('학생 입력의 Markdown과 HTML 주입 문자를 이스케이프한다', () => {
    const result = buildTeacherMarkdownExport(request(false));
    expect(result.markdown).toContain('\\*\\*우주\\*\\*');
    expect(result.markdown).toContain('&lt;script&gt;alert\\(1\\)&lt;/script&gt;');
    expect(result.markdown).not.toContain('<script>');
    expect(escapeMarkdownInline('# 제목\n> 인용')).toBe('\\# 제목 ⏎ &gt; 인용');
  });

  it('교사가 포함을 선택하지 않으면 교사 메모와 프로파일을 내보내지 않는다', () => {
    const result = buildTeacherMarkdownExport(request(false));
    expect(result.markdown).not.toContain('교사용 프로파일');
    expect(result.markdown).not.toContain(profile.teacherNote.value);
    expect(result.markdown).toContain('수업 가정');
    expect(result.markdown).toContain('확인 필요');
  });

  it('명시적으로 선택한 경우에만 허용 필드와 출처를 별도 절에 포함한다', () => {
    const result = buildTeacherMarkdownExport(request(true));
    expect(result.markdown).toContain('## 교사용 프로파일');
    expect(result.markdown).toContain('STUDENT_STATED');
    expect(result.markdown).toContain('TEACHER_OBSERVED');
    expect(result.markdown).toContain(profile.teacherNote.value);
    expect(result.markdown).toContain('민감 특성');
  });

  it('includeTeacherProfile이 false면 전송된 프로파일도 폐기한다', () => {
    const parsed = parseTeacherExportRequest({
      ...request(false),
      teacherProfile: profile,
    });
    expect(parsed.teacherProfile).toBeUndefined();
  });

  it('저장 바이트는 UTF-8-SIG이고 한글을 보존한다', () => {
    const markdown = buildTeacherMarkdownExport(request(false)).markdown;
    const bytes = new Uint8Array(encodeMarkdownWithUtf8Bom(markdown));
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder('utf-8').decode(bytes.slice(3))).toContain('분수의 덧셈과 뺄셈');
  });
});
