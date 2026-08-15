import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  decideGuidanceTransition,
} from '../skills/guide-brief-learner-dialogue/scripts/decide-guidance-transition.mjs';

const root = new URL('../', import.meta.url);
const casesUrl = new URL('tests/fixtures/brief-learner-dialogue-cases.json', root);
const cases = JSON.parse(await readFile(casesUrl, 'utf8'));

test('짧은 발화는 학생 추론을 대신 만들지 않고 대화 부담만 낮춘다', () => {
  for (const fixture of cases) {
    const actual = decideGuidanceTransition(fixture.state, fixture.signal);
    assert.equal(actual.action, fixture.action, fixture.id);
    assert.equal(actual.contributionKind, fixture.contributionKind, fixture.id);
    assert.equal(actual.mayCreditAssessment, false, fixture.id);
    assert.equal(actual.mayCreateEvidence, false, fixture.id);
    assert.equal(actual.mayInferLearnerTrait, false, fixture.id);
  }
});

test('기본 행동 ID와 별도 교과 평가 없이 수행 근거를 만들지 않는다', () => {
  assert.throws(
    () => decideGuidanceTransition(
      {mode: 'DEFAULT_ACTION_OFFERED', briefStreak: 2, defaultActionId: null},
      'BRIEF_CONTINUE',
    ),
    /DEFAULT_ACTION_ID_REQUIRED/u,
  );
  const substantive = decideGuidanceTransition(
    {mode: 'LOW_BURDEN', briefStreak: 2, defaultActionId: null},
    'SUBSTANTIVE',
  );
  assert.equal(substantive.contributionKind, 'STUDENT_CONTENT_UNASSESSED');
  assert.equal(substantive.mayCreditAssessment, false);
  assert.throws(
    () => decideGuidanceTransition(
      {mode: 'DEFAULT_ACTION_OFFERED', briefStreak: 2, defaultActionId: '   '},
      'BRIEF_CONTINUE',
    ),
    /INVALID_DEFAULT_ACTION/u,
  );
});

test('기본 행동 동의와 Agent 시범은 학습자 강점이나 숙달 근거가 아니다', () => {
  const accepted = decideGuidanceTransition(
    {mode: 'DEFAULT_ACTION_OFFERED', briefStreak: 2, defaultActionId: 'inspect-cup-surface'},
    'BRIEF_CONTINUE',
  );
  assert.equal(accepted.contributionKind, 'DEFAULT_ACTION_ACCEPTED');
  assert.equal(accepted.mayCreditAssessment, false);

  const demonstrated = decideGuidanceTransition(
    {mode: 'LOW_BURDEN', briefStreak: 2, defaultActionId: null},
    'DECLINE_QUESTION',
  );
  assert.equal(demonstrated.contributionKind, 'AGENT_DEMONSTRATED');
  assert.equal(demonstrated.mayCreditAssessment, false);
});

test('종료 뒤에는 추가 장면을 만들지 않고 P0는 모든 유도보다 우선한다', () => {
  const stopped = decideGuidanceTransition(
    {mode: 'STOPPED', briefStreak: 1, defaultActionId: null},
    'SUBSTANTIVE',
  );
  assert.equal(stopped.action, 'NO_FURTHER_OUTPUT');

  const p0 = decideGuidanceTransition(
    {mode: 'DEFAULT_ACTION_OFFERED', briefStreak: 2, defaultActionId: 'next'},
    'P0',
  );
  assert.equal(p0.action, 'HAND_OFF_P0');
  assert.equal(p0.state.mode, 'STOPPED');

  const p0AfterStop = decideGuidanceTransition(
    {mode: 'STOPPED', briefStreak: 1, defaultActionId: null},
    'P0',
  );
  assert.equal(p0AfterStop.action, 'HAND_OFF_P0');
  assert.equal(p0AfterStop.contributionKind, 'RISK_SIGNAL');
});

test('Skill과 프로파일 정책은 학생 행동 로그와 평가를 분리한다', async () => {
  const [skill, statePolicy, profilePolicy] = await Promise.all([
    readFile(new URL('skills/guide-brief-learner-dialogue/SKILL.md', root), 'utf8'),
    readFile(new URL('skills/guide-brief-learner-dialogue/references/dialogue-state-contract.md', root), 'utf8'),
    readFile(new URL('skills/guide-brief-learner-dialogue/references/learner-profile-policy.md', root), 'utf8'),
  ]);
  assert.match(skill, /대화 형식만 조절/u);
  assert.match(statePolicy, /짧은 동의는 학생 예측·측정·정답·이해도의 증거가 아니다/u);
  assert.match(profilePolicy, /ACTIVITY_LOGGED/u);
  assert.match(profilePolicy, /DEFAULT_ACTION_ACCEPTED/u);
  assert.match(profilePolicy, /Agent가 제안한 기본 행동에 동의/u);
  assert.match(profilePolicy, /학습 유형/u);
  assert.match(profilePolicy, /성격·지능·장애·건강·가정환경/u);
});

test('학생 런타임은 대화만으로 심리·성격·능력 프로파일을 만들지 않는다', async () => {
  const runtimeFiles = [
    new URL('skills/teach-grounded-scenarios/student-runtime/SKILL.md', root),
    new URL('skills/teach-grounded-scenarios/student-runtime/prompts/05-lesson-turn.prompt.md', root),
    new URL('copilot/studio/STUDIO_INSTRUCTIONS.md', root),
    new URL('chatgpt/custom-gpt/INSTRUCTIONS.md', root),
  ];
  for (const file of runtimeFiles) {
    const contents = (await readFile(file, 'utf8')).replace(/^\uFEFF/u, '');
    assert.match(contents, /대화만으로.*심리.*성격.*공격성.*학습 유형.*집중력.*능력.*숙달.*프로파일링하지 않는다/su);
    assert.match(contents, /명시.*선호.*실제 행동/su);
    assert.match(contents, /현재 세션 관찰 요약/u);
    assert.match(contents, /평가.*기록.*재사용하지 않는다/su);
  }
});

test('새 기계 파일은 UTF-8 무BOM이며 사람용 CJK Skill 문서는 UTF-8-SIG다', async () => {
  const machineFiles = [
    new URL('skills/guide-brief-learner-dialogue/scripts/decide-guidance-transition.mjs', root),
    casesUrl,
    new URL('tests/brief-learner-dialogue.regression-1.test.mjs', root),
  ];
  for (const file of machineFiles) {
    const bytes = await readFile(file);
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.doesNotThrow(() => new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  }

  const humanFiles = [
    new URL('skills/guide-brief-learner-dialogue/SKILL.md', root),
    new URL('skills/guide-brief-learner-dialogue/references/dialogue-state-contract.md', root),
    new URL('skills/guide-brief-learner-dialogue/references/learner-profile-policy.md', root),
  ];
  for (const file of humanFiles) {
    const bytes = await readFile(file);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  }
});
