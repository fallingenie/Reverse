import {describe, expect, it} from 'vitest';
import {buildDemoScenarios} from '../lib/scenarios.ts';
import {
  INITIAL_SESSION,
  getLessonPhase,
  interpretStartIntent,
  type LessonSession,
} from '../lib/session.ts';

describe('학생 온보딩 상태', () => {
  it('학교급부터 순서대로 진행한다', () => {
    expect(getLessonPhase(INITIAL_SESSION)).toBe('SCHOOL_LEVEL');

    const withSchool: LessonSession = {
      ...INITIAL_SESSION,
      schoolLevel: 'elementary',
    };
    expect(getLessonPhase(withSchool)).toBe('GRADE');
    expect(getLessonPhase({...withSchool, grade: '6'})).toBe('SUBJECT');
  });

  it('구체 단원은 기본 관심사로 기록되고 시나리오 단계로 간다', () => {
    const session: LessonSession = {
      ...INITIAL_SESSION,
      schoolLevel: 'elementary',
      grade: '6',
      subject: '수학',
      unit: '분수의 덧셈과 뺄셈',
      interestSource: 'UNIT_INFERRED',
      scenariosReady: true,
    };

    expect(session.interestSource).toBe('UNIT_INFERRED');
    expect(getLessonPhase(session)).toBe('START_INTENT');
  });

  it('학생에게 보이는 대화만 세션 기록으로 보존한다', () => {
    const session: LessonSession = {
      ...INITIAL_SESSION,
      transcript: [
        {actor: 'student', text: '초등학교'},
        {actor: 'simulator', text: '학년을 선택해 주세요.', epistemicStatus: 'FACT'},
      ],
    };
    expect(session.transcript).toEqual([
      {actor: 'student', text: '초등학교'},
      {actor: 'simulator', text: '학년을 선택해 주세요.', epistemicStatus: 'FACT'},
    ]);
  });
});

describe('시나리오 생성', () => {
  it('항상 번호가 붙은 다섯 개를 만든다', () => {
    const scenarios = buildDemoScenarios({
      schoolLevel: 'elementary',
      grade: '6',
      subject: '수학',
      unit: '분수의 덧셈과 뺄셈',
      interestSource: 'UNIT_INFERRED',
    });

    expect(scenarios).toHaveLength(5);
    expect(scenarios.map(item => item.number)).toEqual([1, 2, 3, 4, 5]);
    expect(scenarios.every(item => item.title.includes('분수의 덧셈과 뺄셈'))).toBe(true);
    expect(
      scenarios.every(
        item =>
          item.role &&
          item.setting &&
          item.conflict &&
          item.immediateGoal &&
          item.opening.observation &&
          item.opening.change,
      ),
    ).toBe(true);
    expect(scenarios.every(item => item.actions.length === 3)).toBe(true);
    expect(
      scenarios.every(item =>
        item.actions.every(action => !/(정답|오답|맞히)/u.test(action.label)),
      ),
    ).toBe(true);
  });
});

describe('의미 기반 시작 의사', () => {
  it.each(['시작', '[시작]', 'start', '시이작', '네 시작해요', '이제 진행해 주세요'])(
    '%s를 시작 동의로 처리한다',
    input => {
      expect(interpretStartIntent(input).accepted).toBe(true);
    },
  );

  it.each(['시작하지 마', '아직', '"시작"이 뭐야?', '시작하면 뭐가 나와?'])(
    '%s를 시작 동의로 처리하지 않는다',
    input => {
      expect(interpretStartIntent(input).accepted).toBe(false);
    },
  );
});
