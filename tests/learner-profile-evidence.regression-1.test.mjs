import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const fixtureUrl = new URL('tests/fixtures/learner-profile-overclaim-cases.json', root);

test('학습자 피드백의 과잉 일반화 사례는 평가나 강점으로 승격되지 않는다', async () => {
  const fixtures = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  assert.equal(fixtures.length, 3);
  for (const fixture of fixtures) {
    assert.match(fixture.expectedStatus, /^(NEEDS_CONFIRMATION|NOT_ASSESSED)$/u);
    assert.match(fixture.reason, /독립|시범|증거/u);
  }
});

test('세 런타임 계약은 선택 횟수와 Agent 진행을 독립 수행 근거에서 제외한다', async () => {
  const files = await Promise.all([
    readFile(new URL('chatgpt/custom-gpt/INSTRUCTIONS.md', root), 'utf8'),
    readFile(new URL('copilot/studio/STUDIO_INSTRUCTIONS.md', root), 'utf8'),
    readFile(new URL('skills/teach-grounded-scenarios/student-runtime/SKILL.md', root), 'utf8'),
  ]);
  for (const text of files) {
    assert.match(text, /(?:선택|행동)(?:·행동)? 횟수/u);
    assert.match(text, /Agent/u);
    assert.match(text, /활동 로그/u);
    assert.match(text, /미평가/u);
  }
});

test('외부 피드백 원문을 복사하지 않고 PII 없는 공격 계약만 보존한다', async () => {
  const bytes = await readFile(fixtureUrl);
  assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  assert.doesNotMatch(text, /실명|전화번호|학교명|학번/u);
});
