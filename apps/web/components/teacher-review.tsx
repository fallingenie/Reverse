'use client';

import {useEffect, useState, type Dispatch, type FormEvent, type SetStateAction} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {List, ListItem} from '@astryxdesign/core/List';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Selector} from '@astryxdesign/core/Selector';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Token} from '@astryxdesign/core/Token';
import {VStack} from '@astryxdesign/core/VStack';
import {buildDemoScenarios, profileLabel} from '@/lib/scenarios';
import {getLessonPhase, isProfileComplete, type LessonSession} from '@/lib/session';
import {
  createInitialTeacherProfile,
  encodeMarkdownWithUtf8Bom,
  isSafePseudonymousStudentId,
  type TeacherExportResult,
  type TeacherStudentProfile,
} from '@/lib/teacher-records';

interface TeacherReviewProps {
  session: LessonSession;
  profile: TeacherStudentProfile;
  onProfileChange: Dispatch<SetStateAction<TeacherStudentProfile>>;
}

type TeacherAccess = 'closed' | 'checking' | 'locked' | 'unlocked' | 'unavailable';

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

export function TeacherReview({
  session,
  profile,
  onProfileChange,
}: TeacherReviewProps) {
  const [access, setAccess] = useState<TeacherAccess>('closed');
  const [teacherKey, setTeacherKey] = useState('');
  const [accessMessage, setAccessMessage] = useState('');
  const [includeTeacherProfile, setIncludeTeacherProfile] = useState(false);
  const [preview, setPreview] = useState<TeacherExportResult | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [teacherSessionExpiresAt, setTeacherSessionExpiresAt] = useState(0);
  const scenarios = buildDemoScenarios(session);
  const selectedScenario = scenarios.find(
    scenario => scenario.id === session.selectedScenarioId,
  );
  const complete = isProfileComplete(session);
  const isStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true';

  useEffect(() => {
    if (access !== 'unlocked' || teacherSessionExpiresAt <= 0) return;
    const remaining = teacherSessionExpiresAt - Date.now();
    const expire = () => {
      setAccess('locked');
      setTeacherSessionExpiresAt(0);
      onProfileChange(createInitialTeacherProfile(session));
      setPreview(null);
      setAccessMessage('교사 세션이 만료되었습니다. 키를 다시 입력하세요.');
    };
    if (remaining <= 0) {
      expire();
      return;
    }
    const timer = window.setTimeout(expire, remaining);
    return () => window.clearTimeout(timer);
  }, [access, onProfileChange, session, teacherSessionExpiresAt]);

  function openTeacherTools() {
    setPreview(null);
    if (isStaticExport) {
      setAccess('unavailable');
      setAccessMessage('GitHub Pages는 정적 배포이므로 교사 인증과 기록 내보내기를 제공하지 않습니다. Vercel 배포판에서 사용하세요.');
      return;
    }
    setAccess('locked');
    setAccessMessage('');
  }

  async function unlockTeacherTools(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessMessage('');
    setTeacherKey('');
    try {
      const response = await fetch('/api/teacher/unlock', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({key: teacherKey}),
      });
      const result = (await response.json()) as {authorized?: boolean; error?: string};
      if (response.ok && result.authorized) {
        setAccess('unlocked');
        setTeacherSessionExpiresAt(Date.now() + 15 * 60 * 1000);
        setAccessMessage('교사용 기록 기능을 열었습니다. 기록은 브라우저 메모리에만 있고 세션은 15분 뒤 만료됩니다.');
        return;
      }
      setAccess(response.status === 503 ? 'unavailable' : 'locked');
      setAccessMessage(
        response.status === 429
          ? '입력 횟수가 많아 잠시 잠겼습니다.'
          : response.status === 503
            ? '서버에 교사 인증 환경변수가 설정되지 않았습니다.'
            : '교사 키를 확인할 수 없습니다.',
      );
    } catch {
      setAccess('unavailable');
      setAccessMessage('교사 인증 서버에 연결할 수 없습니다.');
    }
  }

  async function lockTeacherTools() {
    await fetch('/api/teacher/lock', {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => undefined);
    setAccess('closed');
    setTeacherSessionExpiresAt(0);
    onProfileChange(createInitialTeacherProfile(session));
    setPreview(null);
    setAccessMessage('');
  }

  async function requestExportPreview() {
    setIsExporting(true);
    setAccessMessage('');
    try {
       const response = await fetch('/api/teacher/export', {
        method: 'POST',
        credentials: 'same-origin',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({
           session: {
             ...session,
             unit: session.unit.trim() ? 'entered' : '',
             startIntentText: '',
             transcript: [],
           },
          pseudonymousStudentId: profile.pseudonymousStudentId,
          includeTeacherProfile,
          teacherProfile: includeTeacherProfile ? profile : undefined,
        }),
      });
      const result = (await response.json()) as TeacherExportResult & {error?: string};
      if (response.status === 401) {
        setAccess('locked');
        setPreview(null);
        setAccessMessage('교사 세션이 만료되었습니다. 키를 다시 입력하세요.');
        return;
      }
      if (!response.ok) {
        setPreview(null);
        setAccessMessage('내보내기 미리보기를 만들지 못했습니다. 입력 길이와 서버 설정을 확인하세요.');
        return;
      }
      setPreview(result);
      setAccessMessage('내보낼 내용을 만들었습니다. 미리보기를 확인한 뒤 저장하세요.');
    } catch {
      setPreview(null);
      setAccessMessage('내보내기 서버에 연결할 수 없습니다.');
    } finally {
      setIsExporting(false);
    }
  }

  function downloadPreview() {
    if (!preview) return;
    const blob = new Blob([encodeMarkdownWithUtf8Bom(preview.markdown)], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = preview.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <VStack gap={6}>
      <VStack gap={2}>
        <Heading level={2}>교사 검수</Heading>
        <Text color="secondary">
          학생 화면과 분리해 현재 수업의 근거 연결 상태, 수업 가정,
          확인할 항목을 봅니다. 교사 키를 확인하기 전에는 프로파일을 편집하거나
          내보낼 수 없고, 확인 뒤에도 기록은 브라우저 메모리에만 머뭅니다.
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
             브라우저 상태는 학생 입력·선택의 암호학적 원장이 아닙니다. 따라서
             교사용 기록의 시나리오·행동 ID도 확인 필요·미평가로 둡니다. 수업
             가정은 활동 구성을 위한 창작 요소입니다.
          </Text>
        </VStack>
      </Card>

      <Card padding={6}>
        <VStack gap={4}>
          <VStack gap={2}>
             <Heading level={2}>교사용 학생 기록</Heading>
             <Text color="secondary">
               자유입력 원문은 프로파일이나 내보내기에 넣지 않습니다. 가명 ID와
               학교급·학년·과목, 선택한 시나리오·행동 ID만 구조화된 활동 기록으로
               사용합니다. 선택 횟수와 Agent가 제안한 기본 행동 수락은 학생의
               강점이나 숙달 근거가 아닙니다.
            </Text>
            <Text color="secondary">
              현재 베타는 개인 교사 신원·평가 과제·rubric 원장을 검증하지 않으므로
               잠정 패턴이나 평가 완료를 기록할 수 없습니다. 구조화된 선택 사건과
               미평가 상태만 내보냅니다.
            </Text>
          </VStack>

          {access === 'closed' || access === 'checking' ? (
            <Button
              label="교사용 기록·내보내기 열기"
              variant="primary"
              isLoading={access === 'checking'}
              onClick={openTeacherTools}
            />
          ) : null}

          {access === 'locked' ? (
            <form onSubmit={unlockTeacherTools}>
              <FormLayout direction="vertical">
                <TextInput
                  type="password"
                  label="교사 키"
                  description="키는 브라우저에 저장하지 않으며 서버에서 해시로 확인합니다."
                  value={teacherKey}
                  onChange={setTeacherKey}
                  isRequired
                  width="100%"
                />
                <Button
                  type="submit"
                  label="교사용 기록 열기"
                  variant="primary"
                  isDisabled={!teacherKey}
                />
              </FormLayout>
            </form>
          ) : null}

          {accessMessage ? (
            <Banner
              status={access === 'unavailable' || access === 'locked' ? 'warning' : 'info'}
              title={access === 'unavailable' ? '기능을 사용할 수 없습니다' : '교사 기록 상태'}
              description={accessMessage}
            />
          ) : null}

          {access === 'unlocked' ? (
            <VStack gap={5}>
              <HStack gap={3} wrap="wrap">
                <Token label="교사 세션 · 15분" color="green" />
                <Button
                  label="교사용 기록 잠그기"
                  variant="ghost"
                  clickAction={lockTeacherTools}
                />
              </HStack>

              <FormLayout direction="vertical">
                <TextInput
                  label="가명 학생 ID"
                  description="실명·학번·전화번호를 넣지 말고 RVS- 뒤에 영문 대문자·숫자 6자리만 사용하세요. 예: RVS-A2B3C4"
                  value={profile.pseudonymousStudentId}
                  onChange={value => {
                    onProfileChange(current => ({
                      ...current,
                      pseudonymousStudentId: value,
                      updatedAt: new Date().toISOString(),
                    }));
                    setPreview(null);
                  }}
                  width="100%"
                />

                <Grid columns={{minWidth: 280, max: 2, repeat: 'fit'}} gap={4}>
                  <SummaryCard
                    label="학년·단원 활동 기록"
                    value={profile.gradeAndUnit.value || '입력 대기'}
                    detail="학생 탭 입력에서 자동 생성되며 교사 화면에서 바꾸지 않습니다."
                  />
                  <SummaryCard
                     label="선택한 시나리오 활동"
                    value={profile.explicitInterest.value || '선택 전'}
                     detail="시나리오 ID만 확인 필요 상태로 기록합니다. 실제 선택 원장이나 관심·선호·능력의 증거가 아닙니다."
                  />
                  <SummaryCard
                    label="선택한 행동 활동"
                    value={profile.misconceptionEvidence.value || '선택 전'}
                     detail="행동 ID만 확인 필요 상태로 기록합니다. 실제 선택 원장이나 정답·오개념·숙달의 증거가 아닙니다."
                  />
                  <SummaryCard
                    label="교사 자유 메모"
                    value="현재 베타에서 비활성화"
                    detail="민감정보나 평가 문구가 프로파일로 우회 저장되는 것을 막기 위해, 검증된 교사 원장 도입 전까지 자유 메모를 받지 않습니다."
                  />
                </Grid>
                  <Banner
                    status="warning"
                    title="이번 베타에서 평가하지 않는 항목"
                    description="지원 선호, 강점, 숙달, 독립 문제 해결 능력, 오개념 확정은 미평가로 유지합니다. 자유입력 원문과 교사 메모는 내보내지 않으며, 가명 ID와 구조화된 선택 사건만 사용합니다. 별도 평가 원장과 개인 교사 신원 검증이 구현되기 전에는 바꿀 수 없습니다."
                  />
              </FormLayout>

              <SelectableCard
                label="교사용 프로파일을 Markdown에 별도 포함"
                isSelected={includeTeacherProfile}
                onChange={setIncludeTeacherProfile}
                padding={4}
                elevation="low"
              >
                <VStack gap={2}>
                  <Heading level={3}>교사용 프로파일 별도 포함</Heading>
                   <Text color="secondary">
                     선택하지 않으면 개인정보가 제거된 대화 자리표시자와 수업 상태만
                     내보냅니다. 선택하면 위 구조화된 활동 프로파일이 별도 절에 포함됩니다.
                  </Text>
                </VStack>
              </SelectableCard>

              <HStack gap={3} wrap="wrap">
                <Button
                  label="Markdown 미리보기 만들기"
                  variant="primary"
                  isLoading={isExporting}
                  isDisabled={includeTeacherProfile && !isSafePseudonymousStudentId(profile.pseudonymousStudentId)}
                  clickAction={requestExportPreview}
                />
                {preview ? (
                  <Button
                    label="UTF-8-SIG Markdown 저장"
                    variant="secondary"
                    onClick={downloadPreview}
                  />
                ) : null}
              </HStack>

              {preview ? (
                <VStack gap={3}>
                  <TextArea
                    label="내보내기 미리보기"
                    description={`파일명: ${preview.filename} · 손상 확인용 SHA-256(서명 아님): ${preview.sha256}`}
                    value={preview.markdown}
                    onChange={() => undefined}
                    isReadOnly
                    rows={14}
                    width="100%"
                  />
                  <Banner
                    status="info"
                    title="저장 전 확인"
                    description="교사용 프로파일 포함 여부와 가명 사용 여부를 확인하세요. 저장 파일은 UTF-8-SIG로 생성됩니다."
                  />
                </VStack>
              ) : null}
            </VStack>
          ) : null}
        </VStack>
      </Card>
    </VStack>
  );
}
