import {
  createInitialTeacherProfile,
  isSafePseudonymousStudentId,
  type TeacherExportRequest,
} from './teacher-records';
import {
  GRADE_OPTIONS,
  INITIAL_SESSION,
  type SchoolLevel,
} from './session';

export const SUBJECT_OPTIONS = [
  '국어',
  '수학',
  '사회·역사',
  '과학',
  '도덕·윤리',
  '기타·직접 입력',
] as const;

export interface TeacherExportDraft {
  pseudonymousStudentId: string;
  schoolLevel: SchoolLevel | '';
  grade: string;
  subject: string;
  unit: string;
  includeTeacherProfile: boolean;
}

const PSEUDONYM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createPseudonymousStudentId(
  randomValues: Uint8Array = crypto.getRandomValues(new Uint8Array(6)),
): string {
  const suffix = Array.from(
    randomValues,
    value => PSEUDONYM_ALPHABET[value % PSEUDONYM_ALPHABET.length],
  ).join('');
  return `RVS-${suffix}`;
}

export function isTeacherExportDraftValid(draft: TeacherExportDraft): boolean {
  return (
    isSafePseudonymousStudentId(draft.pseudonymousStudentId) &&
    Boolean(draft.schoolLevel) &&
    Boolean(
      draft.schoolLevel &&
      GRADE_OPTIONS[draft.schoolLevel].includes(draft.grade),
    ) &&
    SUBJECT_OPTIONS.includes(draft.subject as (typeof SUBJECT_OPTIONS)[number]) &&
    draft.unit.trim().length > 0
  );
}

export function buildTeacherExportRequest(
  draft: TeacherExportDraft,
): TeacherExportRequest {
  if (!isTeacherExportDraftValid(draft)) {
    throw new Error('INVALID_TEACHER_EXPORT_DRAFT');
  }
  const session = {
    ...INITIAL_SESSION,
    schoolLevel: draft.schoolLevel,
    grade: draft.grade,
    subject: draft.subject,
    unit: draft.unit.trim(),
    interestSource: 'UNIT_INFERRED' as const,
  };
  const teacherProfile = draft.includeTeacherProfile
    ? {
        ...createInitialTeacherProfile(session),
        pseudonymousStudentId: draft.pseudonymousStudentId,
      }
    : undefined;
  return {
    session,
    pseudonymousStudentId: draft.pseudonymousStudentId,
    includeTeacherProfile: draft.includeTeacherProfile,
    teacherProfile,
  };
}
