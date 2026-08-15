export type SchoolLevel = 'elementary' | 'middle' | 'high';

export type InterestSource = 'UNIT_INFERRED' | 'NONE';

export interface LessonProfile {
  schoolLevel: SchoolLevel | '';
  grade: string;
  subject: string;
  unit: string;
  interestSource: InterestSource;
}

export type EpistemicStatus = 'FACT' | 'ASSUMPTION' | 'UNKNOWN';

export interface TranscriptEntry {
  actor: 'student' | 'simulator';
  text: string;
  epistemicStatus?: EpistemicStatus;
}

export interface LessonSession extends LessonProfile {
  scenariosReady: boolean;
  selectedScenarioId: string;
  selectedActionId: string;
  startIntentText: string;
  started: boolean;
  transcript: TranscriptEntry[];
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
  transcript: [],
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
