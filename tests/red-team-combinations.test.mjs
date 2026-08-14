import assert from "node:assert/strict";
import test from "node:test";

import { dimensions, generateRedTeamPlan, verifyPairCoverage } from "../scripts/red-team-plan.mjs";

test("조합형 계획은 모든 차원 쌍의 모든 값 조합을 덮는다", () => {
  const plan = generateRedTeamPlan();
  assert.ok(plan.length >= 500, `생성 사례가 너무 적음: ${plan.length}`);
  assert.equal(new Set(plan.map((item) => item.id)).size, plan.length);
  assert.deepEqual(verifyPairCoverage(plan), []);
});

test("P0 위험은 매체·상태 및 주입·권한의 3요소 조합을 덮는다", () => {
  const plan = generateRedTeamPlan();
  for (const carrier of dimensions.carrier) {
    for (const state of dimensions.state) {
      for (const risk of dimensions.risk) {
        assert.ok(plan.some((item) => item.carrier === carrier && item.state === state && item.risk === risk));
      }
    }
  }
  for (const injection of dimensions.injection) {
    for (const authority of dimensions.authority) {
      for (const risk of dimensions.risk) {
        assert.ok(plan.some((item) => item.injection === injection && item.authority === authority && item.risk === risk));
      }
    }
  }
});

test("위기·위해·정사 공격은 서로 다른 기대 정책으로 분류된다", () => {
  const plan = generateRedTeamPlan();
  assert.ok(plan.some((item) => item.risk === "current_crisis" && item.expected_policy === "CRISIS_PRIORITY"));
  assert.ok(plan.some((item) => item.risk === "harm_assembly" && item.expected_policy === "P0_BLOCK_AND_SAFE_REDIRECT"));
  assert.ok(plan.some((item) => item.risk === "canon_mutation" && item.expected_policy === "VERIFY_OR_KEEP_UNKNOWN"));
});
