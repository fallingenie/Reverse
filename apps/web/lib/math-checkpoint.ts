export interface MathCheckpoint {
  id: string;
  title: string;
  prompt: string;
  hints: readonly [string, string];
  solution: string;
}

export type MathAttemptAssessment = 'CORRECT' | 'RETRY';

const FRACTION_CHECKPOINT: MathCheckpoint = {
  id: 'fraction-addition-scene',
  title: '선택한 행동의 시간 계획',
  prompt:
    '팀이 쓸 수 있는 전체 준비 시간 가운데 자료 위치 기록에 3/8, 사람들의 설명 확인에 1/4을 쓰기로 했습니다. 두 일이 겹치지 않는다면 전체 준비 시간의 얼마를 쓰게 되는지 계산해 보세요.',
  hints: [
    '두 분수의 조각 크기가 다릅니다. 먼저 같은 크기의 조각으로 나타낼 방법을 찾아보세요.',
    '1/4이 8분의 몇과 같은지 먼저 적은 뒤, 같은 분모를 가진 분수끼리 계산해 보세요.',
  ],
  solution: '1/4을 2/8로 바꾸면 3/8 + 2/8 = 5/8입니다.',
};

export function getMathCheckpoint(
  subject: string,
  unit: string,
): MathCheckpoint | null {
  if (subject !== '수학') return null;
  if (!/분수/u.test(unit) || !/(덧셈|뺄셈)/u.test(unit)) return null;
  return FRACTION_CHECKPOINT;
}

export function assessMathAttempt(input: string): MathAttemptAssessment {
  const normalized = input
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/÷/g, '/');

  const isCorrect =
    /(?:^|=)5\/8$/u.test(normalized) ||
    normalized === '8분의5' ||
    normalized === '0.625';

  return isCorrect ? 'CORRECT' : 'RETRY';
}

export function getPartialFeedback(attemptCount: number): string {
  return attemptCount <= 1
    ? '두 양을 바로 더하기 전에 분모가 같은지 확인해 보세요. 지금은 계산 과정 한 단계만 고치면 됩니다.'
    : '1/4을 분모가 8인 분수로 바꾼 뒤, 분모는 유지하고 분자끼리 계산했는지 확인해 보세요.';
}

export function canSubmitMathAttempt(input: {
  attemptCount: number;
  hintLevel: number;
  assessment: MathAttemptAssessment | null;
}): boolean {
  if (input.hintLevel < 1) return false;
  return !(
    input.attemptCount === 1 &&
    input.hintLevel < 2 &&
    input.assessment === 'RETRY'
  );
}

export function isDistinctMathAttempt(
  currentAttempt: string,
  previousAttempt: string,
): boolean {
  const normalize = (value: string) =>
    value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');

  return normalize(currentAttempt) !== normalize(previousAttempt);
}

export function canRevealMathSolution(input: {
  attemptCount: number;
  hintLevel: number;
  assessment: MathAttemptAssessment | null;
}): boolean {
  return (
    input.attemptCount >= 2 &&
    input.hintLevel >= 2 &&
    input.assessment === 'RETRY'
  );
}
