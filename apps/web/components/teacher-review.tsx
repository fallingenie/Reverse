'use client';

import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {List, ListItem} from '@astryxdesign/core/List';
import {Text} from '@astryxdesign/core/Text';
import {Token} from '@astryxdesign/core/Token';
import {VStack} from '@astryxdesign/core/VStack';
import {buildDemoScenarios, profileLabel} from '@/lib/scenarios';
import {getLessonPhase, isProfileComplete, type LessonSession} from '@/lib/session';

interface TeacherReviewProps {
  session: LessonSession;
}

function SummaryCard({
  label,
  value,
  detail,
}: Readonly<{label: string; value: string; detail: string}>) {
  return (
    <Card padding={5}>
      <VStack gap={2}>
        <Text type="label" color="secondary">
          {label}
        </Text>
        <Heading level={3}>{value}</Heading>
        <Text type="supporting" color="secondary">
          {detail}
        </Text>
      </VStack>
    </Card>
  );
}

export function TeacherReview({session}: TeacherReviewProps) {
  const scenarios = buildDemoScenarios(session);
  const selectedScenario = scenarios.find(
    scenario => scenario.id === session.selectedScenarioId,
  );
  const complete = isProfileComplete(session);

  return (
    <VStack gap={6}>
      <VStack gap={2}>
        <Heading level={2}>교사 검수</Heading>
        <Text color="secondary">
          학생 화면과 분리해 현재 수업의 근거 연결 상태, 수업 가정,
          확인할 항목을 봅니다. 이 데모에서는 내용을 편집하거나 저장하지
          않습니다.
        </Text>
      </VStack>

      <Grid columns={{minWidth: 240, max: 3, repeat: 'fit'}} gap={4}>
        <SummaryCard
          label="학습자 프로필"
          value={complete ? profileLabel(session) : '입력 대기'}
          detail={complete ? `${session.subject} · ${session.unit}` : '학생 탭에서 학교급부터 입력합니다.'}
        />
        <SummaryCard
          label="외부 근거"
          value="0건 연결"
          detail="교육과정 PDF, 웹 원문, 논문 검색은 이 웹 데모에 연결되지 않았습니다."
        />
        <SummaryCard
          label="현재 상태"
          value={session.started ? '수업 시작' : '준비 중'}
          detail={`로컬 상태 단계: ${getLessonPhase(session)}`}
        />
      </Grid>

      <List
        density="spacious"
        hasDividers
        header={<Heading level={2}>검수 항목</Heading>}
      >
        <ListItem
          label="교육과정 정렬"
          description="학교급·학년·과목·단원 값은 받았지만 공식 교육과정 문서의 성취기준과 아직 대조하지 않았습니다."
          endContent={<Token label="확인 필요" color="yellow" />}
        />
        <ListItem
          label="단원 중심 관심"
          description={
            session.unit.trim()
              ? `‘${session.unit}’을 기본 관심사로 사용하고 범용 관심사 질문을 생략했습니다.`
              : '단원 입력 전입니다.'
          }
          endContent={
            <Token
              label={session.unit.trim() ? '근거 있음' : '확인 필요'}
              color={session.unit.trim() ? 'green' : 'yellow'}
            />
          }
        />
        <ListItem
          label="시나리오 내용"
          description="다섯 개 선택지는 역할·장소와 시간·갈등·즉시 목표를 가진 로컬 수업 장면이며 역사·과학 사실을 주장하지 않습니다."
          endContent={<Token label="수업 가정" color="blue" />}
        />
        <ListItem
          label="문제집형 퀴즈 아님"
          description="첫 장면은 관찰 단서와 상황 변화로 시작하고, 선택지는 정오답 후보가 아니라 서로 다른 행동 경로로 이어집니다."
          endContent={<Token label="근거 있음" color="green" />}
        />
        <ListItem
          label="학생 선택"
          description={
            selectedScenario
              ? `${selectedScenario.number}. ${selectedScenario.title}`
              : '아직 시나리오를 선택하지 않았습니다.'
          }
          endContent={
            <Token
              label={selectedScenario ? '근거 있음' : '확인 필요'}
              color={selectedScenario ? 'green' : 'yellow'}
            />
          }
        />
        <ListItem
          label="시작 의사 판정"
          description="[시작] 정확 문자열이 아니라 짧고 분명한 시작 의사를 로컬 규칙으로 판정합니다. 부정·질문·조건문은 시작으로 처리하지 않습니다."
          endContent={<Token label="로컬 규칙" color="gray" />}
        />
      </List>

      <Card variant="muted" padding={5}>
        <VStack gap={2}>
          <Heading level={3}>표시 기준</Heading>
          <Text>
            근거 있음은 이 브라우저 세션에서 직접 확인한 입력이나 선택을
            뜻합니다. 수업 가정은 활동 구성을 위한 창작 요소입니다. 확인
            필요는 외부 원문이나 교사 검토가 아직 필요한 상태입니다.
          </Text>
        </VStack>
      </Card>
    </VStack>
  );
}
