import {SCHOOL_LABELS, type LessonSession} from './session';

export const PROFILE_PROVENANCE = [
  'STUDENT_STATED',
  'TEACHER_OBSERVED',
  'NEEDS_CONFIRMATION',
] as const;

export type ProfileProvenance = (typeof PROFILE_PROVENANCE)[number];

export interface ProfileObservation {
  value: string;
  provenance: ProfileProvenance;
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
  generatedAt: string;
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

function isProfileObservation(value: unknown): value is ProfileObservation {
  if (!value || typeof value !== 'object') return false;
  const observation = value as Partial<ProfileObservation>;
  return (
    typeof observation.value === 'string' &&
    PROFILE_PROVENANCE.includes(observation.provenance as ProfileProvenance)
  );
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

export function createInitialTeacherProfile(
  session: LessonSession,
): TeacherStudentProfile {
  const now = new Date(0).toISOString();
  const schoolAndGrade = session.schoolLevel && session.grade
    ? `${SCHOOL_LABELS[session.schoolLevel]} ${session.grade}학년`
    : '';

  return {
    pseudonymousStudentId: '',
    gradeAndUnit: {
      value: [schoolAndGrade, session.unit.trim()].filter(Boolean).join(' · '),
      provenance: 'STUDENT_STATED',
    },
    explicitInterest: {
      value: session.unit.trim(),
      provenance: session.unit.trim() ? 'STUDENT_STATED' : 'NEEDS_CONFIRMATION',
    },
    supportPreference: {value: '', provenance: 'NEEDS_CONFIRMATION'},
    confirmedMisconception: {value: '', provenance: 'NEEDS_CONFIRMATION'},
    misconceptionEvidence: {value: '', provenance: 'NEEDS_CONFIRMATION'},
    teacherNote: {value: '', provenance: 'TEACHER_OBSERVED'},
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
