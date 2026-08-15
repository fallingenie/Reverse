import {describe, expect, it} from 'vitest';
import {INITIAL_SESSION} from '../lib/session.ts';
import {
  buildTeacherMarkdownExport,
  escapeMarkdownInline,
  parseTeacherExportRequest,
} from '../lib/teacher-export.server.ts';
import {
  createInitialTeacherProfile,
  encodeMarkdownWithUtf8Bom,
  type TeacherExportRequest,
  type TeacherStudentProfile,
} from '../lib/teacher-records.ts';

const generatedAt = '2026-08-15T04:00:00.000Z';
const baseSession = {
  ...INITIAL_SESSION,
  schoolLevel: 'elementary' as const,
  grade: '6',
  subject: '수학',
  unit: '분수의 덧셈과 뺄셈',
};
const profile: TeacherStudentProfile = {
  ...createInitialTeacherProfile(baseSession),
  pseudonymousStudentId: 'RVS-A2B3C4',
  updatedAt: generatedAt,
};

function request(includeTeacherProfile: boolean): TeacherExportRequest {
  return {
    generatedAt,
    pseudonymousStudentId: profile.pseudonymousStudentId,
    session: {
      ...baseSession,
      transcript: [
        {actor: 'student', text: '저는 **우주**가 좋아요'},
        {actor: 'student', text: '1/2 + 1/3 = 2/5라고 썼어요'},
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

const serverNow = () => new Date(generatedAt);
const parse = (value: unknown) => parseTeacherExportRequest(value, serverNow());
const build = (value: unknown) => buildTeacherMarkdownExport(value, serverNow());

describe('교사용 Markdown 내보내기', () => {
  it('같은 입력은 같은 파일명·본문·해시를 만든다', () => {
    const first = build(request(false));
    const second = build(request(false));
    expect(first).toEqual(second);
    expect(first.filename).toMatch(/^reverse-session-20260815T040000Z-[a-f0-9]{8}\.md$/u);
    expect(first.markdown).toContain(`<!-- sha256:${first.sha256} -->`);
  });

  it('자유입력 원문은 내보내지 않고 구조화된 사건만 남긴다', () => {
    const result = build(request(false));
    expect(result.markdown).not.toContain('우주');
    expect(result.markdown).not.toContain('alert');
    expect(result.markdown).not.toContain('<script>');
    expect(result.markdown).toContain('학생 자유입력 원문 생략');
    expect(result.markdown).toContain('Reverse 응답 원문 생략');
    expect(result.markdown).toContain('단원: 입력됨\\(원문 비공개\\)');
    expect(escapeMarkdownInline('# 제목\n> 인용')).toBe('\\# 제목 ⏎ &gt; 인용');
  });

  it('교사가 포함을 선택하지 않으면 교사 메모와 프로파일을 내보내지 않는다', () => {
    const result = build(request(false));
    expect(result.markdown).not.toContain('교사용 프로파일');
    expect(result.markdown).not.toContain('교사 자유 메모(비활성화)');
    expect(result.markdown).toContain('화면 표시 기록(사실성 검증 안 됨)');
    expect(result.markdown).toContain('클라이언트 입력');
  });

  it('명시적으로 선택한 경우에만 허용 필드와 출처를 별도 절에 포함한다', () => {
    const result = build(parse(request(true)));
    expect(result.markdown).toContain('## 교사용 프로파일');
    expect(result.markdown).toContain('NEEDS_CONFIRMATION');
    expect(result.markdown).toContain('UNVERIFIED_CLIENT_STATE');
    expect(result.markdown).toContain('NOT_ASSESSED');
    expect(result.markdown).not.toContain('STUDENT_STATED');
    expect(result.markdown).not.toContain('ACTIVITY_LOGGED');
    expect(result.markdown).not.toContain('TENTATIVE_PATTERN');
    expect(result.markdown).not.toMatch(/^\s+- 상태: ASSESSED$/mu);
    expect(result.markdown).toContain('근거 ID');
    expect(result.markdown).toContain('Agent가 제안한 기본 행동 수락');
    expect(result.markdown).toContain('교사 메모는 학생 능력 평가가 아닙니다\\.');
    expect(result.markdown).toContain('민감 특성');
  });

  it('가짜 근거·클라이언트 FACT·PII·평가 표현을 fail-closed한다', () => {
    const fakeEvidence = structuredClone(profile);
    fakeEvidence.explicitInterest.evidenceIds = ['fake'];
    expect(() => parse({...request(true), teacherProfile: fakeEvidence}))
      .toThrow('PROFILE_REQUIRED');

    const evaluative = structuredClone(profile);
    evaluative.misconceptionEvidence.value = '학생은 개념을 완벽히 이해함';
    expect(() => parse({...request(true), teacherProfile: evaluative}))
      .toThrow('PROFILE_REQUIRED');

    const meaninglessLimit = structuredClone(profile);
    meaninglessLimit.misconceptionEvidence.limitations = '특별한 한계 없음';
    expect(() => parse({...request(true), teacherProfile: meaninglessLimit}))
      .toThrow('PROFILE_REQUIRED');

    const assessed = structuredClone(profile);
    assessed.explicitInterest.status = 'ASSESSED';
    assessed.explicitInterest.provenance = 'TEACHER_OBSERVED';
    expect(() => parse({...request(true), teacherProfile: assessed}))
      .toThrow('PROFILE_REQUIRED');

    expect(() => parse({
      ...request(true),
      pseudonymousStudentId: '홍길동-1234',
    })).toThrow('PSEUDONYM_REQUIRED');

    const piiRequest = request(false);
    piiRequest.session.transcript = [{actor: 'student', text: '전화번호: 010-1234-5678'}];
    const piiParsed = parse(piiRequest);
    expect(piiParsed.session.transcript[0]?.text).toBe('[학생 자유입력 원문 생략: 개인정보 보호]');

    const factRequest = request(false);
    factRequest.session.transcript = [{actor: 'simulator', text: '가상 결과', epistemicStatus: 'FACT'}];
    const parsed = parse(factRequest);
    expect(parsed.session.transcript[0]?.epistemicStatus).toBeUndefined();

    for (const sensitiveText of [
      '저는 우주가 좋아요',
      '저는 서울초등학교 6학년 2반 김민수예요',
      '서울초 6학년 2반 김민수입니다',
      '김민수예요. 서울초 6-2예요',
      'ADHD가 의심되고 가정폭력 가능성이 있음',
      '집에서 자주 맞아서 무서워요',
    ]) {
      const unsafe = request(false);
      unsafe.session.transcript = [{actor: 'student', text: sensitiveText}];
      const parsedUnsafe = parse(unsafe);
      expect(parsedUnsafe.session.transcript[0]?.text).toBe('[학생 자유입력 원문 생략: 개인정보 보호]');
    }

    for (const [scenarioId, actionId] of [
      ['student-mastered-everything', 'teacher-approved'],
      ['archive-blackout', 'preserve-scene'],
    ]) {
      const forgedSelection = request(false);
      forgedSelection.session.scenariosReady = true;
      forgedSelection.session.selectedScenarioId = scenarioId;
      forgedSelection.session.selectedActionId = actionId;
      forgedSelection.session.startIntentText = '시작';
      forgedSelection.session.started = true;
      const parsedSelection = parse(forgedSelection);
      expect(parsedSelection.session.scenariosReady).toBe(false);
      expect(parsedSelection.session.selectedScenarioId).toBe('');
      expect(parsedSelection.session.selectedActionId).toBe('');
      expect(parsedSelection.session.startIntentText).toBe('');
      expect(parsedSelection.session.started).toBe(false);
    }

    const forgedGrade = request(false);
    forgedGrade.session.grade = '6학년 2반 김민수 010-1234-5678';
    const parsedGrade = parse(forgedGrade);
    expect(parsedGrade.session.grade).toBe('');
    expect(build(forgedGrade).markdown).not.toMatch(/김민수|010-1234-5678/u);
  });

  it('생성·갱신 시각은 클라이언트 값이 아니라 서버 시각을 사용한다', () => {
    const forged = structuredClone(profile);
    forged.updatedAt = '1999-01-01T00:00:00.000Z';
    const parsed = parse({
      ...request(true),
      generatedAt: '2099-01-01T00:00:00.000Z',
      teacherProfile: forged,
    });
    expect(parsed.generatedAt).toBe(generatedAt);
    expect(parsed.teacherProfile?.updatedAt).toBe(generatedAt);
  });

  it('Agent 시범과 기본 행동 수락을 숙달·잠정 강점으로 승격하지 않는다', () => {
    const unsafeProfile = structuredClone(profile);
    unsafeProfile.supportPreference = {
      value: '직접 조작 활동에 강점',
      provenance: 'AGENT_DEMONSTRATED',
      status: 'TENTATIVE_PATTERN',
      evidenceIds: ['auto-step-1', 'auto-step-2'],
      limitations: '없음',
    };
    expect(() => parse({
      ...request(true),
      teacherProfile: unsafeProfile,
    })).toThrow('PROFILE_REQUIRED');
  });

  it('includeTeacherProfile이 false면 전송된 프로파일도 폐기한다', () => {
    const parsed = parse({
      ...request(false),
      teacherProfile: profile,
    });
    expect(parsed.teacherProfile).toBeUndefined();
  });

  it('저장 바이트는 UTF-8-SIG이고 한글을 보존한다', () => {
    const markdown = build(request(false)).markdown;
    const bytes = new Uint8Array(encodeMarkdownWithUtf8Bom(markdown));
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const decoded = new TextDecoder('utf-8').decode(bytes.slice(3));
    expect(decoded).toContain('단원: 입력됨\\(원문 비공개\\)');
    expect(decoded).not.toContain('분수의 덧셈과 뺄셈');
  });
});
