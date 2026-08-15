import {createHash} from 'node:crypto';
import type {
  ProfileObservation,
  ProfileProvenance,
  ProfileStatus,
  TeacherExportRequest,
  TeacherExportResult,
  TeacherStudentProfile,
} from './teacher-records';
import {
  containsEvaluativeProfileClaim,
  createInitialTeacherProfile,
  isSafePseudonymousStudentId,
  isTeacherStudentProfile,
  isTeacherStudentProfileSemanticallyValid,
} from './teacher-records';
import {
  GRADE_OPTIONS,
  SCHOOL_LABELS,
  type LessonSession,
  type TranscriptEntry,
} from './session';

const MAX_EXPORT_BYTES = 128 * 1024;
const MAX_SHORT_TEXT = 240;
const MAX_LONG_TEXT = 2_000;
const PROVENANCE = new Set<ProfileProvenance>([
  'STUDENT_STATED',
  'STUDENT_INITIATED',
  'STUDENT_SELECTED',
  'DEFAULT_ACTION_ACCEPTED',
  'AGENT_DEMONSTRATED',
  'TEACHER_OBSERVED',
  'NEEDS_CONFIRMATION',
]);
const PROFILE_STATUSES = new Set<ProfileStatus>([
  'UNVERIFIED_CLIENT_STATE',
  'ACTIVITY_LOGGED',
  'TENTATIVE_PATTERN',
  'ASSESSED',
  'NOT_ASSESSED',
]);
const LIKELY_PII = [
  /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u,
  /(?:01[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}/u,
  /\b\d{6}-?[1-4]\d{6}\b/u,
  /(?:실명|이름|학번|전화번호|주소)\s*[:=]\s*\S+/u,
  /(?:초등|중|고등)?학교.{0,30}\d{1,2}\s*학년.{0,20}\d{1,2}\s*반/iu,
  /(?:저는|제\s*이름은|학생은)\s*[가-힣]{2,4}(?:이|가|입니다|예요|이에요|라고)/u,
];
const SENSITIVE_LEARNER_DATA =
  /ADHD|주의력\s*결핍|자폐|장애|질환|진단|병명|우울|자해|자살|가정\s*폭력|학대|정신\s*건강|IQ|지능|종교|성적\s*지향|성별\s*정체성|인종|출신\s*국가|소득|기초\s*생활|가정\s*환경/iu;

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

function safeProfileStatus(value: unknown): ProfileStatus {
  return PROFILE_STATUSES.has(value as ProfileStatus)
    ? (value as ProfileStatus)
    : 'NOT_ASSESSED';
}

function safeEvidenceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .slice(0, 32)
    .map(id => cleanText(id, MAX_SHORT_TEXT).trim())
    .filter(Boolean))];
}

function safeObservation(value: unknown): ProfileObservation {
  const observation = value && typeof value === 'object'
    ? (value as Partial<ProfileObservation>)
    : {};
  return {
    value: cleanText(observation.value, MAX_LONG_TEXT),
    provenance: safeProvenance(observation.provenance),
    status: safeProfileStatus(observation.status),
    evidenceIds: safeEvidenceIds(observation.evidenceIds),
    limitations: cleanText(observation.limitations, MAX_LONG_TEXT),
  };
}

function hasLikelyPii(value: string): boolean {
  const normalized = value.normalize('NFKC');
  return LIKELY_PII.some(pattern => pattern.test(normalized)) ||
    SENSITIVE_LEARNER_DATA.test(normalized);
}

function safeProfile(
  value: unknown,
  session: LessonSession,
  pseudonymousStudentId: string,
  serverGeneratedAt: string,
): TeacherStudentProfile | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const profile = value as Partial<TeacherStudentProfile>;
  const suppliedProfileId = cleanText(
    profile.pseudonymousStudentId,
    MAX_SHORT_TEXT,
  );
  if (suppliedProfileId !== pseudonymousStudentId) return undefined;
  const sanitized = {
    pseudonymousStudentId,
    gradeAndUnit: safeObservation(profile.gradeAndUnit),
    explicitInterest: safeObservation(profile.explicitInterest),
    supportPreference: safeObservation(profile.supportPreference),
    confirmedMisconception: safeObservation(profile.confirmedMisconception),
    misconceptionEvidence: safeObservation(profile.misconceptionEvidence),
    teacherNote: safeObservation(profile.teacherNote),
    updatedAt: serverGeneratedAt,
  };
  if (
    !isTeacherStudentProfile(sanitized) ||
    !isTeacherStudentProfileSemanticallyValid(sanitized)
  ) return undefined;

  const expected = createInitialTeacherProfile(session);
  const profileFields: Array<keyof Omit<TeacherStudentProfile, 'pseudonymousStudentId' | 'updatedAt'>> = [
    'gradeAndUnit',
    'explicitInterest',
    'supportPreference',
    'confirmedMisconception',
    'misconceptionEvidence',
    'teacherNote',
  ];
  if (profileFields.some(field =>
    JSON.stringify(sanitized[field]) !== JSON.stringify(expected[field])
  )) return undefined;

  const observations = Object.values(sanitized)
    .filter((candidate): candidate is ProfileObservation =>
      Boolean(candidate) && typeof candidate === 'object' && 'limitations' in candidate,
    );
  if (observations.some(observation =>
    hasLikelyPii(observation.value) ||
    hasLikelyPii(observation.limitations) ||
    containsEvaluativeProfileClaim(observation.value)
  )) return undefined;
  return sanitized;
}

function safeTranscript(value: unknown): TranscriptEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).flatMap((entry): TranscriptEntry[] => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as Partial<TranscriptEntry>;
    if (candidate.actor !== 'student' && candidate.actor !== 'simulator') return [];
    const text = cleanText(candidate.text, MAX_LONG_TEXT);
    if (!text) return [];
    return [{
      actor: candidate.actor,
      text: candidate.actor === 'student'
        ? '[학생 자유입력 원문 생략: 개인정보 보호]'
        : '[Reverse 응답 원문 생략: 공개 베타에는 검증된 대화 원장이 없음]',
    }];
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
  const gradeCandidate = cleanText(session.grade, MAX_SHORT_TEXT).trim();
  const grade = schoolLevel && GRADE_OPTIONS[schoolLevel].includes(gradeCandidate)
    ? gradeCandidate
    : '';
  const draft: LessonSession = {
    schoolLevel,
    grade,
    subject: ['국어', '수학', '사회·역사', '과학', '도덕·윤리', '기타·직접 입력']
      .includes(cleanText(session.subject, MAX_SHORT_TEXT))
      ? cleanText(session.subject, MAX_SHORT_TEXT)
      : '',
    unit: cleanText(session.unit, MAX_SHORT_TEXT).trim()
      ? '입력됨(원문 비공개)'
      : '',
    interestSource: session.interestSource === 'UNIT_INFERRED' ? 'UNIT_INFERRED' : 'NONE',
    scenariosReady: false,
    selectedScenarioId: '',
    selectedActionId: '',
    startIntentText: '',
    started: false,
    transcript: safeTranscript(session.transcript),
  };
  return draft;
}

export function parseTeacherExportRequest(
  value: unknown,
  serverNow: Date = new Date(),
): TeacherExportRequest {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_EXPORT_BYTES) {
    throw new Error('EXPORT_TOO_LARGE');
  }
  if (!value || typeof value !== 'object') throw new Error('INVALID_EXPORT');
  const request = value as Partial<TeacherExportRequest>;
  const generatedAt = serverNow.toISOString();
  if (Number.isNaN(serverNow.getTime())) {
    throw new Error('INVALID_EXPORT_DATE');
  }
  const includeTeacherProfile = request.includeTeacherProfile === true;
  const session = safeSession(request.session);
  const pseudonymousStudentId = cleanText(
    request.pseudonymousStudentId,
    MAX_SHORT_TEXT,
  );
  if (
    (pseudonymousStudentId && !isSafePseudonymousStudentId(pseudonymousStudentId)) ||
    (includeTeacherProfile && !pseudonymousStudentId)
  ) {
    throw new Error('PSEUDONYM_REQUIRED');
  }
  const teacherProfile = includeTeacherProfile
    ? safeProfile(request.teacherProfile, session, pseudonymousStudentId, generatedAt)
    : undefined;
  if (includeTeacherProfile && !teacherProfile) {
    throw new Error('PROFILE_REQUIRED');
  }
  return {
    generatedAt,
    session,
    pseudonymousStudentId,
    includeTeacherProfile,
    teacherProfile,
  };
}

function observationLine(label: string, observation: ProfileObservation): string {
  const evidence = observation.evidenceIds.length > 0
    ? observation.evidenceIds.map(escapeMarkdownInline).join(', ')
    : '없음';
  return [
    `- ${label} · 구조화된 세션 기록: ${escapeMarkdownInline(observation.value || '기록 없음')}`,
    `  - 상태: ${observation.status}`,
    `  - 기여 출처: ${observation.provenance}`,
    `  - 근거 ID: ${evidence}`,
    `  - 한계: ${escapeMarkdownInline(observation.limitations || '기록 없음')}`,
  ].join('\n');
}

export function buildTeacherMarkdownExport(
  value: unknown,
  serverNow: Date = new Date(),
): TeacherExportResult {
  const request = parseTeacherExportRequest(value, serverNow);
  const generatedAt = new Date(request.generatedAt ?? serverNow.toISOString()).toISOString();
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
    '- 범위: 구조화된 수업 상태와 개인정보를 제거한 대화 자리표시자',
    '',
    '## 수업 정보',
    '',
    `- 학교급: ${escapeMarkdownInline(request.session.schoolLevel ? SCHOOL_LABELS[request.session.schoolLevel] : '기록 없음')}`,
    `- 학년: ${escapeMarkdownInline(request.session.grade || '기록 없음')}`,
    `- 과목: ${escapeMarkdownInline(request.session.subject || '기록 없음')}`,
    `- 단원: ${escapeMarkdownInline(request.session.unit || '기록 없음')}`,
    '',
    '## 대화 자리표시자',
    '',
  ];

  if (request.session.transcript.length === 0) {
    lines.push('- 기록 없음');
  } else {
    request.session.transcript.forEach(entry => {
      const actor = entry.actor === 'student' ? '학생' : 'Reverse';
      lines.push(`- **${actor} · 화면 표시 기록(사실성 검증 안 됨):** ${escapeMarkdownInline(entry.text)}`);
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
      observationLine('학년·과목·단원 입력 여부', profile.gradeAndUnit),
      observationLine('선택한 시나리오 ID', profile.explicitInterest),
      observationLine('지원 선호(미평가)', profile.supportPreference),
      observationLine('오개념 여부(미평가)', profile.confirmedMisconception),
      observationLine('선택한 행동 ID', profile.misconceptionEvidence),
      observationLine('교사 자유 메모(비활성화)', profile.teacherNote),
      `- 서버 생성 시각: ${escapeMarkdownInline(profile.updatedAt)}`,
    );
  }

  lines.push(
    '',
    '## 해석 주의',
    '',
    '- 학생이 직접 말하지 않은 민감 특성, 건강 상태, 가정환경, 능력은 추론하지 않습니다.',
    '- 선택 횟수, Agent가 제안한 기본 행동 수락, 자동 진행은 강점·숙달·독립 수행의 증거가 아닙니다.',
    '- 현재 베타는 평가 원장과 개인 교사 신원을 검증하지 않으므로 잠정 패턴과 평가 완료 상태를 저장하지 않습니다.',
    '- 학생 대화의 사실·가정 표지는 클라이언트 입력이므로 이 파일에서 검증된 사실로 승격하지 않습니다.',
    '- 마지막 SHA-256은 전송 중 손상 확인용 checksum이며 교사 서명이나 평가 진본성 증명이 아닙니다.',
    '- 확인 필요 항목은 선생님이나 교과서, 참고서를 확인하여 주세요.',
    '',
  );

  const body = `${lines.join('\n')}\n`;
  const sha256 = createHash('sha256').update(body, 'utf8').digest('hex');
  const markdown = `${body}<!-- sha256:${sha256} -->\n`;
  return {filename, markdown, sha256};
}
