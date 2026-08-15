export type SchoolLevel = 'elementary' | 'middle' | 'high';

export type InterestSource = 'UNIT_INFERRED' | 'NONE';

export type LessonPhase =
  | 'SCHOOL_LEVEL'
  | 'GRADE'
  | 'SUBJECT'
  | 'UNIT'
  | 'SCENARIOS'
  | 'START_INTENT'
  | 'LESSON';

export interface LessonProfile {
  schoolLevel: SchoolLevel | '';
  grade: string;
  subject: string;
  unit: string;
  interestSource: InterestSource;
}

export interface LessonSession extends LessonProfile {
  scenariosReady: boolean;
  selectedScenarioId: string;
  selectedActionId: string;
  startIntentText: string;
  started: boolean;
}

export interface StartIntentResult {
  accepted: boolean;
  reason:
    | 'CLEAR_START'
    | 'EMPTY'
    | 'NEGATED'
    | 'QUESTION_OR_CONDITIONAL'
    | 'UNCLEAR';
}

export const INITIAL_SESSION: LessonSession = {
  schoolLevel: '',
  grade: '',
  subject: '',
  unit: '',
  interestSource: 'NONE',
  scenariosReady: false,
  selectedScenarioId: '',
  selectedActionId: '',
  startIntentText: '',
  started: false,
};

export const GRADE_OPTIONS: Record<SchoolLevel, string[]> = {
  elementary: ['3', '4', '5', '6'],
  middle: ['1', '2', '3'],
  high: ['1', '2'],
};

export const SCHOOL_LABELS: Record<SchoolLevel, string> = {
  elementary: '초등학교',
  middle: '중학교',
  high: '고등학교',
};

export function getLessonPhase(session: LessonSession): LessonPhase {
  if (!session.schoolLevel) return 'SCHOOL_LEVEL';
  if (!session.grade) return 'GRADE';
  if (!session.subject) return 'SUBJECT';
  if (!session.unit.trim()) return 'UNIT';
  if (!session.scenariosReady) return 'SCENARIOS';
  if (!session.selectedScenarioId || !session.started) return 'START_INTENT';
  return 'LESSON';
}

export function isProfileComplete(session: LessonSession): boolean {
  return Boolean(
    session.schoolLevel &&
      session.grade &&
      session.subject &&
      session.unit.trim(),
  );
}

function normalizeIntent(input: string): string {
  return input
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .trim()
    .replace(/[\[\]{}()<>"'`~!.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function interpretStartIntent(input: string): StartIntentResult {
  const normalized = normalizeIntent(input);

  if (!normalized) return {accepted: false, reason: 'EMPTY'};

  const negated =
    /(시작|진행).{0,5}(하지 ?마|하지 ?말|안 ?할|싫|말고)|^(중단|그만|취소|아직|나중에)|\b(don't|do not|stop|cancel|not yet)\b/u;
  if (negated.test(normalized)) {
    return {accepted: false, reason: 'NEGATED'};
  }

  const questionOrConditional =
    /[?？]|(시작|진행).{0,8}(하면|이라면|가능|어떻게|뭐가|될까|돼\??$)/u;
  if (questionOrConditional.test(input) || questionOrConditional.test(normalized)) {
    return {accepted: false, reason: 'QUESTION_OR_CONDITIONAL'};
  }

  if (normalized.length > 48) {
    return {accepted: false, reason: 'UNCLEAR'};
  }

  const clearStart =
    /^(네 |예 |응 |좋아 |그래 )?(이제 )?(시+이*작|시작|출발|진행|가자|해보자|해 주세요|해주세요|하자|준비됐어|준비됐어요|ready|start|begin|go ahead)(해|해요|해줘|해 주세요|해주세요|할게|하겠습니다|합니다|요|줘|자|할래|할래요)?$/u;

  return clearStart.test(normalized)
    ? {accepted: true, reason: 'CLEAR_START'}
    : {accepted: false, reason: 'UNCLEAR'};
}
