'use client';

import {useState, type FormEvent} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {HStack} from '@astryxdesign/core/HStack';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Token} from '@astryxdesign/core/Token';
import {VStack} from '@astryxdesign/core/VStack';
import {
  assessMathAttempt,
  canRevealMathSolution,
  canSubmitMathAttempt,
  getPartialFeedback,
  isDistinctMathAttempt,
  type MathAttemptAssessment,
  type MathCheckpoint,
} from '@/lib/math-checkpoint';

interface MathLearningCheckpointProps {
  checkpoint: MathCheckpoint;
}

export function MathLearningCheckpoint({
  checkpoint,
}: MathLearningCheckpointProps) {
  const [hintLevel, setHintLevel] = useState(0);
  const [attemptText, setAttemptText] = useState('');
  const [attemptCount, setAttemptCount] = useState(0);
  const [assessment, setAssessment] =
    useState<MathAttemptAssessment | null>(null);
  const [lastSubmittedAttempt, setLastSubmittedAttempt] = useState('');
  const [attemptIssue, setAttemptIssue] = useState<
    'EMPTY' | 'DUPLICATE' | null
  >(null);
  const [solutionRevealed, setSolutionRevealed] = useState(false);

  const canReveal = canRevealMathSolution({
    attemptCount,
    hintLevel,
    assessment,
  });
  const canSubmit = canSubmitMathAttempt({
    attemptCount,
    hintLevel,
    assessment,
  });

  function submitAttempt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!attemptText.trim()) {
      setAttemptIssue('EMPTY');
      return;
    }
    if (
      lastSubmittedAttempt &&
      !isDistinctMathAttempt(attemptText, lastSubmittedAttempt)
    ) {
      setAttemptIssue('DUPLICATE');
      return;
    }

    setAttemptIssue(null);
    setLastSubmittedAttempt(attemptText);
    setAttemptCount(current => current + 1);
    setAssessment(assessMathAttempt(attemptText));
    setSolutionRevealed(false);
  }

  return (
    <Card padding={6} variant="blue">
      <VStack gap={4}>
        <HStack gap={3} wrap="wrap" vAlign="center">
          <Token label="수학 점검" color="teal" />
          <Text color="secondary">정답은 조건을 충족한 뒤에만 공개됩니다.</Text>
        </HStack>

        <VStack gap={2}>
          <Heading level={2}>{checkpoint.title}</Heading>
          <Text type="large">{checkpoint.prompt}</Text>
        </VStack>

        {hintLevel === 0 ? (
          <Button
            label="힌트 1 보기"
            variant="secondary"
            onClick={() => setHintLevel(1)}
          />
        ) : (
          <Banner
            status="info"
            title="힌트 1"
            description={checkpoint.hints[0]}
          />
        )}

        {canSubmit ? (
          <form onSubmit={submitAttempt}>
            <FormLayout direction="vertical">
              <TextInput
                label="내 계산 또는 생각"
                description="식이나 답을 직접 적어 보세요. 빈 답안은 시도로 세지 않습니다."
                placeholder="내가 생각한 계산 과정을 입력하세요"
                value={attemptText}
                onChange={value => {
                  setAttemptText(value);
                  setAttemptIssue(null);
                }}
                status={
                  attemptIssue
                    ? {
                        type: 'error',
                        message:
                          attemptIssue === 'EMPTY'
                            ? '먼저 자신의 시도를 입력해 주세요.'
                            : '직전 답안과 다른 계산이나 생각을 적어 주세요.',
                      }
                    : undefined
                }
                width="100%"
              />
              <Button type="submit" label="시도 제출" variant="primary" />
            </FormLayout>
          </form>
        ) : null}

        {assessment === 'CORRECT' ? (
          <Banner
            status="success"
            title="직접 해결했습니다"
            description="계산 결과가 맞습니다. 어떤 변환을 사용했는지 한 문장으로 설명해 보세요."
          />
        ) : null}

        {assessment === 'RETRY' ? (
          <VStack gap={3}>
            <Banner
              status="warning"
              title="부분 피드백"
              description={getPartialFeedback(attemptCount)}
            />
            {hintLevel < 2 ? (
              <VStack gap={2}>
                <Text color="secondary">
                  다음 시도는 힌트 2를 확인한 뒤 입력할 수 있습니다.
                </Text>
                <Button
                  label="힌트 2 보기"
                  variant="secondary"
                  onClick={() => setHintLevel(2)}
                />
              </VStack>
            ) : (
              <Banner
                status="info"
                title="힌트 2"
                description={checkpoint.hints[1]}
              />
            )}
          </VStack>
        ) : null}

        {canReveal && !solutionRevealed ? (
          <VStack gap={2}>
            <Text color="secondary">
              두 번의 시도와 두 단계 힌트를 확인했습니다. 원하면 이제 풀이를
              공개할 수 있습니다.
            </Text>
            <Button
              label="풀이 공개"
              variant="secondary"
              onClick={() => setSolutionRevealed(true)}
            />
          </VStack>
        ) : null}

        {solutionRevealed ? (
          <Banner
            status="info"
            title="풀이 공개"
            description={checkpoint.solution}
          />
        ) : null}
      </VStack>
    </Card>
  );
}
