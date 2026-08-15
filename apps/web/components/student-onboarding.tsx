'use client';

import type {Dispatch, FormEvent, SetStateAction} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack} from '@astryxdesign/core/HStack';
import {Heading} from '@astryxdesign/core/Heading';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Selector} from '@astryxdesign/core/Selector';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Token} from '@astryxdesign/core/Token';
import {VStack} from '@astryxdesign/core/VStack';
import {buildDemoScenarios, profileLabel} from '@/lib/scenarios';
import {
  GRADE_OPTIONS,
  INITIAL_SESSION,
  getLessonPhase,
  interpretStartIntent,
  isProfileComplete,
  type LessonSession,
  type SchoolLevel,
} from '@/lib/session';

interface StudentOnboardingProps {
  session: LessonSession;
  onChange: Dispatch<SetStateAction<LessonSession>>;
}

const SCHOOL_OPTIONS = [
  {value: 'elementary', label: '초등학교'},
  {value: 'middle', label: '중학교'},
  {value: 'high', label: '고등학교'},
];

const SUBJECT_OPTIONS = [
  '국어',
  '수학',
  '사회·역사',
  '과학',
  '도덕·윤리',
  '지리',
  '융합',
].map(value => ({value, label: value}));

const PHASE_LABELS = {
  SCHOOL_LEVEL: '학교급 확인',
  GRADE: '학년 확인',
  SUBJECT: '과목 확인',
  UNIT: '단원 확인',
  SCENARIOS: '시나리오 준비',
  START_INTENT: '선택과 시작',
  LESSON: '수업 진행',
} as const;

export function StudentOnboarding({
  session,
  onChange,
}: StudentOnboardingProps) {
  const phase = getLessonPhase(session);
  const scenarios = buildDemoScenarios(session);
  const selectedScenario = scenarios.find(
    scenario => scenario.id === session.selectedScenarioId,
  );
  const startResult = session.startIntentText
    ? interpretStartIntent(session.startIntentText)
    : null;

  function selectSchool(value: string) {
    onChange({
      ...INITIAL_SESSION,
      schoolLevel: value as SchoolLevel,
    });
  }

  function selectGrade(value: string) {
    onChange(current => ({
      ...current,
      grade: value,
      subject: '',
      unit: '',
      interestSource: 'NONE',
      scenariosReady: false,
      selectedScenarioId: '',
      selectedActionId: '',
      started: false,
    }));
  }

  function selectSubject(value: string) {
    onChange(current => ({
      ...current,
      subject: value,
      unit: '',
      interestSource: 'NONE',
      scenariosReady: false,
      selectedScenarioId: '',
      selectedActionId: '',
      startIntentText: '',
      started: false,
    }));
  }

  function updateUnit(value: string) {
    onChange(current => ({
      ...current,
      unit: value,
      interestSource: value.trim() ? 'UNIT_INFERRED' : 'NONE',
      scenariosReady: false,
      selectedScenarioId: '',
      selectedActionId: '',
      startIntentText: '',
      started: false,
    }));
  }

  function prepareScenarios(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isProfileComplete(session)) return;
    onChange(current => ({...current, scenariosReady: true}));
  }

  function selectScenario(id: string, isSelected: boolean) {
    onChange(current => ({
      ...current,
      selectedScenarioId: isSelected ? id : '',
      selectedActionId: '',
      startIntentText: '',
      started: false,
    }));
  }

  function selectAction(id: string, isSelected: boolean) {
    onChange(current => ({
      ...current,
      selectedActionId: isSelected ? id : '',
    }));
  }

  function evaluateStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session.selectedScenarioId) return;
    const result = interpretStartIntent(session.startIntentText);
    if (!result.accepted) return;
    onChange(current => ({...current, started: true}));
  }

  return (
    <VStack gap={6}>
      <HStack gap={3} wrap="wrap" vAlign="center">
        <Token label={`현재 단계 · ${PHASE_LABELS[phase]}`} color="blue" />
        {session.schoolLevel && session.grade ? (
          <Token label={profileLabel(session)} color="gray" />
        ) : null}
        {session.subject ? <Token label={session.subject} color="teal" /> : null}
      </HStack>

      <Card padding={6}>
        <VStack gap={5}>
          <VStack gap={1}>
            <Heading level={2}>수업 정보</Heading>
            <Text color="secondary">
              학교급부터 차례로 확인합니다. 구체적인 단원을 입력하면 그
              단원을 기본 관심사로 사용합니다.
            </Text>
          </VStack>

          <form onSubmit={prepareScenarios}>
            <FormLayout direction="vertical">
              <Selector
                label="학교급"
                placeholder="학교급을 먼저 선택하세요"
                options={SCHOOL_OPTIONS}
                value={session.schoolLevel}
                onChange={selectSchool}
                isRequired
              />

              {session.schoolLevel ? (
                <Selector
                  label="학년"
                  placeholder="학년을 선택하세요"
                  options={GRADE_OPTIONS[session.schoolLevel].map(value => ({
                    value,
                    label: `${value}학년`,
                  }))}
                  value={session.grade}
                  onChange={selectGrade}
                  isRequired
                />
              ) : null}

              {session.grade ? (
                <Selector
                  label="현재 공부 중인 과목"
                  placeholder="과목을 선택하세요"
                  options={SUBJECT_OPTIONS}
                  value={session.subject}
                  onChange={selectSubject}
                  isRequired
                />
              ) : null}

              {session.subject ? (
                <TextInput
                  label="현재 공부 중인 단원"
                  description="예: 분수의 덧셈과 뺄셈, 힘과 운동, 조선 후기의 변화"
                  placeholder="교과서의 단원명을 입력하세요"
                  value={session.unit}
                  onChange={updateUnit}
                  isRequired
                  width="100%"
                />
              ) : null}

              {session.unit.trim() ? (
                <Banner
                  status="success"
                  title="단원을 기본 관심사로 반영했습니다"
                  description="범용 관심사 목록은 다시 묻지 않고 이 단원을 중심으로 진행합니다."
                />
              ) : null}

              {isProfileComplete(session) ? (
                <HStack gap={3} wrap="wrap">
                  <Button
                    type="submit"
                    label="맞춤 시나리오 5개 보기"
                    variant="primary"
                  />
                  <Button
                    label="처음부터 다시 입력"
                    variant="secondary"
                    onClick={() => onChange(INITIAL_SESSION)}
                  />
                </HStack>
              ) : null}
            </FormLayout>
          </form>
        </VStack>
      </Card>

      {session.scenariosReady ? (
        <VStack gap={4}>
          <VStack gap={1}>
            <Heading level={2}>시나리오를 하나 고르세요</Heading>
            <Text color="secondary">
              아래 다섯 카드는 수업 흐름을 확인하기 위한 로컬 예시입니다.
              사실 자료와 출처는 아직 연결되지 않았습니다.
            </Text>
          </VStack>
          <Grid columns={{minWidth: 280, max: 2, repeat: 'fit'}} gap={4}>
            {scenarios.map(scenario => (
              <SelectableCard
                key={scenario.id}
                label={`${scenario.number}. ${scenario.title}`}
                isSelected={session.selectedScenarioId === scenario.id}
                onChange={isSelected =>
                  selectScenario(scenario.id, isSelected)
                }
                padding={5}
                elevation="low"
              >
                <VStack gap={2}>
                  <Heading level={3}>
                    {scenario.number}. {scenario.title}
                  </Heading>
                  <Text color="secondary">{scenario.description}</Text>
                  <Text type="supporting">
                    <strong>역할</strong> · {scenario.role}
                  </Text>
                  <Text type="supporting">
                    <strong>장소·시간</strong> · {scenario.setting}
                  </Text>
                  <Text type="supporting">
                    <strong>갈등</strong> · {scenario.conflict}
                  </Text>
                  <Text type="supporting">
                    <strong>즉시 목표</strong> · {scenario.immediateGoal}
                  </Text>
                </VStack>
              </SelectableCard>
            ))}
          </Grid>
        </VStack>
      ) : null}

      {selectedScenario && !session.started ? (
        <Card padding={6} variant="blue">
          <VStack gap={4}>
            <VStack gap={1}>
              <Heading level={2}>선택한 수업: {selectedScenario.title}</Heading>
              <Text>{selectedScenario.description}</Text>
            </VStack>
            <Text color="secondary">
              준비되면 시작 의사를 자연스럽게 말해 주세요. 예: 시작,
              start, 시이작, 이제 진행해 주세요.
            </Text>
            <form onSubmit={evaluateStart}>
              <FormLayout direction="vertical">
                <TextInput
                  label="시작 의사"
                  placeholder="준비됐다는 뜻을 입력하세요"
                  value={session.startIntentText}
                  onChange={value =>
                    onChange(current => ({
                      ...current,
                      startIntentText: value,
                    }))
                  }
                  status={
                    startResult && !startResult.accepted
                      ? {
                          type: 'warning',
                          message:
                            '시작 의사가 분명하지 않습니다. 시작하거나 멈출 뜻을 짧게 말해 주세요.',
                        }
                      : undefined
                  }
                  width="100%"
                />
                <Button type="submit" label="수업 시작" variant="primary" />
              </FormLayout>
            </form>
          </VStack>
        </Card>
      ) : null}

      {selectedScenario && session.started ? (
        <VStack gap={4}>
          <Banner
            status="success"
            title="수업을 시작했습니다"
            description="이 장면은 외부 자료를 사용하지 않는 로컬 데모입니다."
          />
          <Card padding={6} elevation="low">
            <VStack gap={3}>
              <Token label="수업 가정" color="blue" />
              <Heading level={2}>{selectedScenario.title}</Heading>
              <Text color="secondary">
                {selectedScenario.role} · {selectedScenario.setting}
              </Text>
              <Heading level={3}>눈앞에서 확인되는 단서</Heading>
              <Text type="large">{selectedScenario.opening.observation}</Text>
              <Banner
                status="info"
                title="상황이 바뀌었습니다"
                description={selectedScenario.opening.change}
              />
              <Text color="secondary">
                실제 배포판에서는 검증된 교육과정 자료와 외부 근거를
                연결해야 합니다. 현재 장면은 그 기능을 제공하지 않습니다.
              </Text>
            </VStack>
          </Card>

          <VStack gap={3}>
            <VStack gap={1}>
              <Heading level={2}>첫 행동을 고르세요</Heading>
              <Text color="secondary">
                정답 후보가 아니라 상황을 바꾸는 서로 다른 행동 경로입니다.
              </Text>
            </VStack>
            <Grid columns={{minWidth: 280, max: 3, repeat: 'fit'}} gap={4}>
              {selectedScenario.actions.map((action, index) => (
                <SelectableCard
                  key={action.id}
                  label={`${index + 1}. ${action.label}`}
                  isSelected={session.selectedActionId === action.id}
                  onChange={isSelected => selectAction(action.id, isSelected)}
                  padding={5}
                  elevation="low"
                >
                  <VStack gap={2}>
                    <Heading level={3}>
                      {index + 1}. {action.label}
                    </Heading>
                    <Text color="secondary">{action.description}</Text>
                  </VStack>
                </SelectableCard>
              ))}
            </Grid>
            {session.selectedActionId ? (
              <Banner
                status="success"
                title="행동 경로를 선택했습니다"
                description="이 로컬 데모는 여기까지 진행됩니다. 선택에는 정답 판정이 붙지 않습니다."
              />
            ) : null}
          </VStack>
        </VStack>
      ) : null}
    </VStack>
  );
}
