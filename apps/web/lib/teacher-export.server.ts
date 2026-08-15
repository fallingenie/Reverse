import {createHash} from 'node:crypto';
import type {
  ProfileObservation,
  ProfileProvenance,
  TeacherExportRequest,
  TeacherExportResult,
  TeacherStudentProfile,
} from './teacher-records';
import {SCHOOL_LABELS, type LessonSession, type TranscriptEntry} from './session';

const MAX_EXPORT_BYTES = 128 * 1024;
const MAX_SHORT_TEXT = 240;
const MAX_LONG_TEXT = 2_000;
const PROVENANCE = new Set<ProfileProvenance>([
  'STUDENT_STATED',
  'TEACHER_OBSERVED',
  'NEEDS_CONFIRMATION',
]);

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu, '')
    .replace(/\r\n?/gu, '\n')
    .slice(0, maxLength);
}

export function escapeMarkdownInline(value: string): string {
  return cleanText(value, MAX_LONG_TEXT)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/([\\`*_\[\]{}()#+.!|\-])/gu, '\\$1')
    .replace(/\n/gu, ' ⏎ ');
}

function safeProvenance(value: unknown): ProfileProvenance {
  return PROVENANCE.has(value as ProfileProvenance)
    ? (value as ProfileProvenance)
    : 'NEEDS_CONFIRMATION';
}

function safeObservation(value: unknown): ProfileObservation {
  const observation = value && typeof value === 'object'
    ? (value as Partial<ProfileObservation>)
    : {};
  return {
    value: cleanText(observation.value, MAX_LONG_TEXT),
    provenance: safeProvenance(observation.provenance),
  };
}

function safeProfile(value: unknown): TeacherStudentProfile | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const profile = value as Partial<TeacherStudentProfile>;
  return {
    pseudonymousStudentId: cleanText(
      profile.pseudonymousStudentId,
      MAX_SHORT_TEXT,
    ),
    gradeAndUnit: safeObservation(profile.gradeAndUnit),
    explicitInterest: safeObservation(profile.explicitInterest),
    supportPreference: safeObservation(profile.supportPreference),
    confirmedMisconception: safeObservation(profile.confirmedMisconception),
    misconceptionEvidence: safeObservation(profile.misconceptionEvidence),
    teacherNote: safeObservation(profile.teacherNote),
    updatedAt: cleanText(profile.updatedAt, 40),
  };
}

function safeTranscript(value: unknown): TranscriptEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).flatMap((entry): TranscriptEntry[] => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as Partial<TranscriptEntry>;
    if (candidate.actor !== 'student' && candidate.actor !== 'simulator') return [];
    const text = cleanText(candidate.text, MAX_LONG_TEXT);
    if (!text) return [];
    const status =
      candidate.epistemicStatus === 'FACT' ||
      candidate.epistemicStatus === 'ASSUMPTION' ||
      candidate.epistemicStatus === 'UNKNOWN'
        ? candidate.epistemicStatus
        : undefined;
    return [{actor: candidate.actor, text, epistemicStatus: status}];
  });
}

function safeSession(value: unknown): LessonSession {
  const session = value && typeof value === 'object'
    ? (value as Partial<LessonSession>)
    : {};
  const schoolLevel =
    session.schoolLevel === 'elementary' ||
    session.schoolLevel === 'middle' ||
    session.schoolLevel === 'high'
      ? session.schoolLevel
      : '';
  return {
    schoolLevel,
    grade: cleanText(session.grade, MAX_SHORT_TEXT),
    subject: cleanText(session.subject, MAX_SHORT_TEXT),
    unit: cleanText(session.unit, MAX_SHORT_TEXT),
    interestSource: session.interestSource === 'UNIT_INFERRED' ? 'UNIT_INFERRED' : 'NONE',
    scenariosReady: Boolean(session.scenariosReady),
    selectedScenarioId: cleanText(session.selectedScenarioId, MAX_SHORT_TEXT),
    selectedActionId: cleanText(session.selectedActionId, MAX_SHORT_TEXT),
    startIntentText: cleanText(session.startIntentText, MAX_SHORT_TEXT),
    started: Boolean(session.started),
    transcript: safeTranscript(session.transcript),
  };
}

export function parseTeacherExportRequest(value: unknown): TeacherExportRequest {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_EXPORT_BYTES) {
    throw new Error('EXPORT_TOO_LARGE');
  }
  if (!value || typeof value !== 'object') throw new Error('INVALID_EXPORT');
  const request = value as Partial<TeacherExportRequest>;
  const generatedAt = cleanText(request.generatedAt, 40);
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error('INVALID_EXPORT_DATE');
  }
  const includeTeacherProfile = request.includeTeacherProfile === true;
  const teacherProfile = includeTeacherProfile
    ? safeProfile(request.teacherProfile)
    : undefined;
  if (includeTeacherProfile && !teacherProfile) {
    throw new Error('PROFILE_REQUIRED');
  }
  return {
    generatedAt: new Date(generatedAt).toISOString(),
    session: safeSession(request.session),
    pseudonymousStudentId: cleanText(request.pseudonymousStudentId, MAX_SHORT_TEXT),
    includeTeacherProfile,
    teacherProfile,
  };
}

const STATUS_LABELS = {
  FACT: '확인된 사실',
  ASSUMPTION: '수업 가정',
  UNKNOWN: '확인 필요',
} as const;

function observationLine(label: string, observation: ProfileObservation): string {
  return `- ${label}: ${escapeMarkdownInline(observation.value || '기록 없음')} (${observation.provenance})`;
}

export function buildTeacherMarkdownExport(
  request: TeacherExportRequest,
): TeacherExportResult {
  const generatedAt = new Date(request.generatedAt).toISOString();
  const profileId = request.pseudonymousStudentId;
  const idDigest = createHash('sha256')
    .update(profileId || 'anonymous', 'utf8')
    .digest('hex')
    .slice(0, 8);
  const stamp = generatedAt.replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
  const filename = `reverse-session-${stamp}-${idDigest}.md`;
  const lines = [
    '# Reverse 수업 기록',
    '',
    `- 내보내기 버전: 1`,
    `- 생성 시각: ${generatedAt}`,
    `- 학생 식별: ${profileId ? escapeMarkdownInline(profileId) : '익명'}`,
    '- 범위: 학생에게 실제로 표시된 대화와 학생 입력',
    '',
    '## 수업 정보',
    '',
    `- 학교급: ${escapeMarkdownInline(request.session.schoolLevel ? SCHOOL_LABELS[request.session.schoolLevel] : '기록 없음')}`,
    `- 학년: ${escapeMarkdownInline(request.session.grade || '기록 없음')}`,
    `- 과목: ${escapeMarkdownInline(request.session.subject || '기록 없음')}`,
    `- 단원: ${escapeMarkdownInline(request.session.unit || '기록 없음')}`,
    '',
    '## 학생에게 보인 대화',
    '',
  ];

  if (request.session.transcript.length === 0) {
    lines.push('- 기록 없음');
  } else {
    request.session.transcript.forEach(entry => {
      const actor = entry.actor === 'student' ? '학생' : 'Reverse';
      const status = entry.epistemicStatus
        ? ` · ${STATUS_LABELS[entry.epistemicStatus]}`
        : '';
      lines.push(`- **${actor}${status}:** ${escapeMarkdownInline(entry.text)}`);
    });
  }

  if (request.includeTeacherProfile && request.teacherProfile) {
    const profile = request.teacherProfile;
    lines.push(
      '',
      '## 교사용 프로파일',
      '',
      '> 이 절은 교사가 미리보기에서 포함을 명시적으로 선택한 경우에만 추가됩니다.',
      '',
      observationLine('학년·단원', profile.gradeAndUnit),
      observationLine('학생이 밝힌 관심', profile.explicitInterest),
      observationLine('지원 선호', profile.supportPreference),
      observationLine('확인된 오개념', profile.confirmedMisconception),
      observationLine('오개념 근거', profile.misconceptionEvidence),
      observationLine('교사 메모', profile.teacherNote),
      `- 갱신 시각: ${escapeMarkdownInline(profile.updatedAt)}`,
    );
  }

  lines.push(
    '',
    '## 해석 주의',
    '',
    '- 학생이 직접 말하지 않은 민감 특성, 건강 상태, 가정환경, 능력은 추론하지 않습니다.',
    '- 확인 필요 항목은 선생님이나 교과서, 참고서를 확인하여 주세요.',
    '',
  );

  const body = `${lines.join('\n')}\n`;
  const sha256 = createHash('sha256').update(body, 'utf8').digest('hex');
  const markdown = `${body}<!-- sha256:${sha256} -->\n`;
  return {filename, markdown, sha256};
}
