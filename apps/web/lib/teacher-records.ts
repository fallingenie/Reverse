import {SCHOOL_LABELS, type LessonSession} from './session';

export const PROFILE_PROVENANCE = [
  'STUDENT_STATED',
  'STUDENT_INITIATED',
  'STUDENT_SELECTED',
  'DEFAULT_ACTION_ACCEPTED',
  'AGENT_DEMONSTRATED',
  'TEACHER_OBSERVED',
  'NEEDS_CONFIRMATION',
] as const;

export type ProfileProvenance = (typeof PROFILE_PROVENANCE)[number];

export const PROFILE_STATUS = [
  'UNVERIFIED_CLIENT_STATE',
  'ACTIVITY_LOGGED',
  'TENTATIVE_PATTERN',
  'ASSESSED',
  'NOT_ASSESSED',
] as const;

export type ProfileStatus = (typeof PROFILE_STATUS)[number];

export interface ProfileObservation {
  value: string;
  provenance: ProfileProvenance;
  status: ProfileStatus;
  evidenceIds: string[];
  limitations: string;
}

export interface TeacherStudentProfile {
  pseudonymousStudentId: string;
  gradeAndUnit: ProfileObservation;
  explicitInterest: ProfileObservation;
  supportPreference: ProfileObservation;
  confirmedMisconception: ProfileObservation;
  misconceptionEvidence: ProfileObservation;
  teacherNote: ProfileObservation;
  updatedAt: string;
}

export interface TeacherExportRequest {
  generatedAt?: string;
  session: LessonSession;
  pseudonymousStudentId: string;
  includeTeacherProfile: boolean;
  teacherProfile?: TeacherStudentProfile;
}

export interface TeacherExportResult {
  filename: string;
  markdown: string;
  sha256: string;
}

const EVALUATIVE_PROFILE_CLAIM =
  /강점|약점|숙달|능력|지능|성격|학습\s*유형|오개념|독립\s*(?:수행|해결)|우수|부족|재능|집중력|성취|능숙|완벽|정확히\s*이해|스스로\s*(?:해결|수행)|잘(?:함|한다|했음)|못(?:함|한다|했음)|선호(?:함|한다)|master(?:ed|y)?|independent(?:ly)?|proficien(?:t|cy)|ability/iu;

export function isSafePseudonymousStudentId(value: string): boolean {
  return /^RVS-[A-Z2-9]{6}$/u.test(value);
}

export function containsEvaluativeProfileClaim(value: string): boolean {
  return EVALUATIVE_PROFILE_CLAIM.test(value.normalize('NFKC'));
}

export function isProfileObservation(value: unknown): value is ProfileObservation {
  if (!value || typeof value !== 'object') return false;
  const observation = value as Partial<ProfileObservation>;
  const structurallyValid = (
    typeof observation.value === 'string' &&
    PROFILE_PROVENANCE.includes(observation.provenance as ProfileProvenance) &&
    PROFILE_STATUS.includes(observation.status as ProfileStatus) &&
    Array.isArray(observation.evidenceIds) &&
    observation.evidenceIds.every(id => typeof id === 'string' && id.trim().length > 0) &&
    new Set(observation.evidenceIds).size === observation.evidenceIds.length &&
    typeof observation.limitations === 'string'
  );
  return structurallyValid;
}

export function isProfileObservationSemanticallyValid(
  value: ProfileObservation,
): boolean {
  const observation = value;

  const hasValue = observation.value.trim().length > 0;
  const hasEvidence = observation.evidenceIds.length > 0;
  const limitations = observation.limitations.normalize('NFKC').trim();
  if (
    limitations.length === 0 ||
    /^(?:특별한\s*)?(?:한계\s*)?(?:없음|없다|없습니다|해당\s*없음|n\/?a|-)[.!]?$/iu.test(limitations)
  ) return false;

  // 현재 베타는 평가 원장·교사 신원·과제 rubric을 검증하지 않는다.
  // 따라서 잠정 패턴과 평가 완료를 저장 가능한 상태로 가장하지 않는다.
  if (observation.status === 'TENTATIVE_PATTERN' || observation.status === 'ASSESSED') {
    return false;
  }
  if (observation.status === 'NOT_ASSESSED') {
    return !hasValue && !hasEvidence && observation.provenance === 'NEEDS_CONFIRMATION';
  }
  if (observation.status === 'UNVERIFIED_CLIENT_STATE') {
    return hasValue && hasEvidence &&
      observation.provenance === 'NEEDS_CONFIRMATION' &&
      !containsEvaluativeProfileClaim(observation.value);
  }
  if (hasValue && !hasEvidence) return false;
  if (hasValue && containsEvaluativeProfileClaim(observation.value)) return false;
  return true;
}

export function isTeacherStudentProfile(
  value: unknown,
): value is TeacherStudentProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<TeacherStudentProfile>;
  return (
    typeof profile.pseudonymousStudentId === 'string' &&
    typeof profile.updatedAt === 'string' &&
    isProfileObservation(profile.gradeAndUnit) &&
    isProfileObservation(profile.explicitInterest) &&
    isProfileObservation(profile.supportPreference) &&
    isProfileObservation(profile.confirmedMisconception) &&
    isProfileObservation(profile.misconceptionEvidence) &&
    isProfileObservation(profile.teacherNote)
  );
}

export function isTeacherStudentProfileSemanticallyValid(
  value: TeacherStudentProfile,
): boolean {
  const observationsValid = [
    value.gradeAndUnit,
    value.explicitInterest,
    value.supportPreference,
    value.confirmedMisconception,
    value.misconceptionEvidence,
    value.teacherNote,
  ].every(isProfileObservationSemanticallyValid);
  if (!observationsValid) return false;
  if (
    value.supportPreference.status !== 'NOT_ASSESSED' ||
    value.confirmedMisconception.status !== 'NOT_ASSESSED'
  ) return false;
  if (
    value.gradeAndUnit.status === 'ACTIVITY_LOGGED' &&
    value.gradeAndUnit.provenance !== 'STUDENT_STATED'
  ) return false;
  if (
    value.explicitInterest.status === 'ACTIVITY_LOGGED' &&
    value.explicitInterest.provenance !== 'STUDENT_SELECTED'
  ) return false;
  if (
    value.misconceptionEvidence.status === 'ACTIVITY_LOGGED' &&
    value.misconceptionEvidence.provenance !== 'STUDENT_SELECTED'
  ) return false;
  if (value.teacherNote.status !== 'NOT_ASSESSED') return false;
  return true;
}

export function createInitialTeacherProfile(
  session: LessonSession,
): TeacherStudentProfile {
  const now = new Date(0).toISOString();
  const schoolAndGrade = session.schoolLevel && session.grade
    ? `${SCHOOL_LABELS[session.schoolLevel]} ${session.grade}학년`
    : '';
  const gradeEvidenceIds = [
    session.schoolLevel ? 'profile.schoolLevel' : '',
    session.grade ? 'profile.grade' : '',
    session.subject ? 'profile.subject' : '',
    session.unit.trim() ? 'profile.unit' : '',
  ].filter(Boolean);
  const gradeAndUnit = [
    schoolAndGrade,
    session.subject,
    session.unit.trim() ? '단원 입력됨(원문 비공개)' : '',
  ].filter(Boolean).join(' · ');
  const scenarioSelected = session.selectedScenarioId.trim();
  const actionSelected = session.selectedActionId.trim();

  return {
    pseudonymousStudentId: '',
    gradeAndUnit: {
      value: gradeAndUnit,
      provenance: 'NEEDS_CONFIRMATION',
      status: gradeAndUnit ? 'UNVERIFIED_CLIENT_STATE' : 'NOT_ASSESSED',
      evidenceIds: gradeEvidenceIds,
      limitations: gradeAndUnit
        ? '학생 입력 기록이며 공식 교육과정 문서와의 일치는 아직 검증하지 않았습니다.'
        : '학교급·학년·단원이 아직 수집되지 않았습니다.',
    },
    explicitInterest: {
      value: scenarioSelected,
      provenance: 'NEEDS_CONFIRMATION',
      status: scenarioSelected ? 'UNVERIFIED_CLIENT_STATE' : 'NOT_ASSESSED',
      evidenceIds: scenarioSelected ? ['session.selectedScenario'] : [],
      limitations: scenarioSelected
        ? '선택한 시나리오 ID의 활동 기록이며 관심·선호·능력은 평가하지 않았습니다.'
        : '시나리오를 아직 선택하지 않았습니다.',
    },
    supportPreference: {
      value: '',
      provenance: 'NEEDS_CONFIRMATION',
      status: 'NOT_ASSESSED',
      evidenceIds: [],
      limitations: 'Agent가 제안한 선택이나 자동 진행만으로 지원 선호를 추론하지 않습니다.',
    },
    confirmedMisconception: {
      value: '',
      provenance: 'NEEDS_CONFIRMATION',
      status: 'NOT_ASSESSED',
      evidenceIds: [],
      limitations: '명시된 평가 과제와 교사 확인 전에는 오개념을 확정하지 않습니다.',
    },
    misconceptionEvidence: {
      value: actionSelected,
      provenance: 'NEEDS_CONFIRMATION',
      status: actionSelected ? 'UNVERIFIED_CLIENT_STATE' : 'NOT_ASSESSED',
      evidenceIds: actionSelected ? ['session.selectedAction'] : [],
      limitations: actionSelected
        ? '선택한 행동 ID의 활동 기록이며 정답·오개념·숙달은 평가하지 않았습니다.'
        : '행동 경로를 아직 선택하지 않았습니다.',
    },
    teacherNote: {
      value: '',
      provenance: 'NEEDS_CONFIRMATION',
      status: 'NOT_ASSESSED',
      evidenceIds: [],
      limitations: '교사 메모는 학생 능력 평가가 아닙니다.',
    },
    updatedAt: now,
  };
}

export function encodeMarkdownWithUtf8Bom(markdown: string): ArrayBuffer {
  const content = new TextEncoder().encode(markdown);
  const buffer = new ArrayBuffer(content.length + 3);
  const output = new Uint8Array(buffer);
  output.set([0xef, 0xbb, 0xbf]);
  output.set(content, 3);
  return buffer;
}
