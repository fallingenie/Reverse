import {describe, expect, it} from 'vitest';
import {
  assessMathAttempt,
  canRevealMathSolution,
  canSubmitMathAttempt,
  getMathCheckpoint,
  getPartialFeedback,
  isDistinctMathAttempt,
} from '../lib/math-checkpoint.ts';

describe('수학 풀이 공개 게이트', () => {
  it('분수 계산 단원에만 현재 데모 점검을 연결한다', () => {
    expect(getMathCheckpoint('수학', '분수의 덧셈과 뺄셈')).not.toBeNull();
    expect(getMathCheckpoint('과학', '분수의 덧셈과 뺄셈')).toBeNull();
    expect(getMathCheckpoint('수학', '함수')).toBeNull();
  });

  it('문제·힌트·부분 피드백에는 최종 답과 완성 계산식이 없다', () => {
    const checkpoint = getMathCheckpoint('수학', '분수의 덧셈과 뺄셈');
    expect(checkpoint).not.toBeNull();

    const beforeReveal = [
      checkpoint?.prompt,
      ...(checkpoint?.hints ?? []),
      getPartialFeedback(1),
      getPartialFeedback(2),
    ].join('\n');

    expect(beforeReveal).not.toContain('5/8');
    expect(beforeReveal).not.toContain('3/8 + 2/8 = 5/8');
  });

  it('두 번의 시도와 두 힌트 전에는 풀이를 공개하지 않는다', () => {
    expect(
      canRevealMathSolution({
        attemptCount: 1,
        hintLevel: 2,
        assessment: 'RETRY',
      }),
    ).toBe(false);
    expect(
      canRevealMathSolution({
        attemptCount: 2,
        hintLevel: 1,
        assessment: 'RETRY',
      }),
    ).toBe(false);
    expect(
      canRevealMathSolution({
        attemptCount: 2,
        hintLevel: 2,
        assessment: 'RETRY',
      }),
    ).toBe(true);
  });

  it('힌트 1 뒤 첫 시도, 힌트 2 뒤 재시도의 순서를 지킨다', () => {
    expect(
      canSubmitMathAttempt({
        attemptCount: 0,
        hintLevel: 0,
        assessment: null,
      }),
    ).toBe(false);
    expect(
      canSubmitMathAttempt({
        attemptCount: 0,
        hintLevel: 1,
        assessment: null,
      }),
    ).toBe(true);
    expect(
      canSubmitMathAttempt({
        attemptCount: 1,
        hintLevel: 1,
        assessment: 'RETRY',
      }),
    ).toBe(false);
    expect(
      canSubmitMathAttempt({
        attemptCount: 1,
        hintLevel: 2,
        assessment: 'RETRY',
      }),
    ).toBe(true);
  });

  it('같은 답안의 공백·유니코드 표기 차이는 새 시도로 세지 않는다', () => {
    expect(isDistinctMathAttempt('1 / 2', '1/2')).toBe(false);
    expect(isDistinctMathAttempt('３/８', '3/8')).toBe(false);
    expect(isDistinctMathAttempt('3/4', '3/8')).toBe(true);
  });

  it('동치 표현은 맞게 판정하고 부분 문자열은 오답으로 유지한다', () => {
    expect(assessMathAttempt('3/8 + 1/4 = 5/8')).toBe('CORRECT');
    expect(assessMathAttempt('8분의 5')).toBe('CORRECT');
    expect(assessMathAttempt('15/8')).toBe('RETRY');
  });
});
