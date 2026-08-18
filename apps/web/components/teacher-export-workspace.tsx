'use client';

import {useEffect, useMemo, useState, type FormEvent} from 'react';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {HStack} from '@astryxdesign/core/HStack';
import {Heading} from '@astryxdesign/core/Heading';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Selector} from '@astryxdesign/core/Selector';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {TopNav, TopNavHeading} from '@astryxdesign/core/TopNav';
import {VStack} from '@astryxdesign/core/VStack';
import {
  buildTeacherExportRequest,
  createPseudonymousStudentId,
  isTeacherExportDraftValid,
  SUBJECT_OPTIONS,
  type TeacherExportDraft,
} from '@/lib/teacher-export.client';
import {encodeMarkdownWithUtf8Bom, type TeacherExportResult} from '@/lib/teacher-records';
import {GRADE_OPTIONS, type SchoolLevel} from '@/lib/session';

type AuthorizationState = 'checking' | 'locked' | 'authorized' | 'unconfigured';

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const IS_STATIC_EXPORT = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true';
const SCHOOL_OPTIONS = [
  {value: 'elementary', label: '초등학교'},
  {value: 'middle', label: '중학교'},
  {value: 'high', label: '고등학교'},
];

const INITIAL_DRAFT: TeacherExportDraft = {
  pseudonymousStudentId: '',
  schoolLevel: '',
  grade: '',
  subject: '',
  unit: '',
  includeTeacherProfile: false,
};

function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    INVALID_TEACHER_KEY: '교사 키가 맞지 않습니다.',
    TOO_MANY_ATTEMPTS: '시도가 너무 많습니다. 잠시 후 다시 시도하세요.',
    TEACHER_EXPORT_NOT_CONFIGURED: '서버에 교사용 내보내기 설정이 없습니다.',
    TEACHER_SESSION_REQUIRED: '교사 세션이 만료되었습니다. 다시 인증하세요.',
    ORIGIN_REJECTED: '허용되지 않은 요청 출처입니다.',
    PSEUDONYM_REQUIRED: '가명 학생 ID 형식을 확인하세요.',
    PROFILE_REQUIRED: '교사 프로파일의 근거 경계를 확인하세요.',
  };
  return messages[code] ?? '요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.';
}

async function readErrorCode(response: Response): Promise<string> {
  const payload = await response.json().catch(() => ({})) as {error?: unknown};
  return typeof payload.error === 'string' ? payload.error : 'UNKNOWN_ERROR';
}

export function TeacherExportWorkspace() {
  const [authorization, setAuthorization] = useState<AuthorizationState>(
    IS_STATIC_EXPORT ? 'unconfigured' : 'checking',
  );
  const [teacherKey, setTeacherKey] = useState('');
  const [draft, setDraft] = useState<TeacherExportDraft>(INITIAL_DRAFT);
  const [result, setResult] = useState<TeacherExportResult | null>(null);
  const [notice, setNotice] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (IS_STATIC_EXPORT) return;
    void fetch('/api/teacher/status', {credentials: 'same-origin'})
      .then(async response => {
        if (response.status === 503) {
          setAuthorization('unconfigured');
          return;
        }
        const payload = await response.json() as {authorized?: unknown};
        setAuthorization(payload.authorized === true ? 'authorized' : 'locked');
      })
      .catch(() => {
        setAuthorization('locked');
        setNotice('교사 인증 상태를 확인하지 못했습니다. 네트워크를 확인하세요.');
      });
  }, []);

  const gradeOptions = useMemo(
    () => draft.schoolLevel
      ? GRADE_OPTIONS[draft.schoolLevel].map(value => ({value, label: `${value}학년`}))
      : [],
    [draft.schoolLevel],
  );
  const canExport = isTeacherExportDraftValid(draft);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUnlocking(true);
    setNotice('');
    try {
      const response = await fetch('/api/teacher/unlock', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({key: teacherKey}),
      });
      setTeacherKey('');
      if (!response.ok) {
        const code = await readErrorCode(response);
        setAuthorization(code === 'TEACHER_EXPORT_NOT_CONFIGURED' ? 'unconfigured' : 'locked');
        setNotice(errorMessage(code));
        return;
      }
      setAuthorization('authorized');
      setNotice('교사 세션이 열렸습니다. 15분 뒤 자동으로 만료됩니다.');
    } catch {
      setTeacherKey('');
      setNotice('교사 인증 요청에 실패했습니다. 네트워크를 확인하세요.');
    } finally {
      setIsUnlocking(false);
    }
  }

  async function lock() {
    await fetch('/api/teacher/lock', {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => undefined);
    setAuthorization('locked');
    setDraft(INITIAL_DRAFT);
    setResult(null);
    setNotice('교사 세션을 잠갔습니다.');
  }

  async function exportMarkdown(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canExport) return;
    setIsExporting(true);
    setNotice('');
    try {
      const response = await fetch('/api/teacher/export', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(buildTeacherExportRequest(draft)),
      });
      if (!response.ok) {
        const code = await readErrorCode(response);
        if (code === 'TEACHER_SESSION_REQUIRED') setAuthorization('locked');
        setNotice(errorMessage(code));
        return;
      }
      const payload = await response.json() as TeacherExportResult;
      setResult(payload);
      setNotice('서버가 Markdown 미리보기를 생성했습니다. 내용을 확인한 뒤 저장하세요.');
    } catch {
      setNotice('Markdown 생성 요청에 실패했습니다. 네트워크를 확인하세요.');
    } finally {
      setIsExporting(false);
    }
  }

  function downloadMarkdown() {
    if (!result) return;
    const blob = new Blob([encodeMarkdownWithUtf8Bom(result.markdown)], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const topNav = (
    <TopNav
      label="Reverse 교사 기록 주요 탐색"
      heading={<TopNavHeading heading="Reverse" subheading="교사 기록" />}
      endContent={
        <HStack gap={4} wrap="wrap">
          <Link href={`${PUBLIC_BASE_PATH}/`} hasUnderline isStandalone>
            수업 화면
          </Link>
          <Link href={`${PUBLIC_BASE_PATH}/guide/`} hasUnderline isStandalone>
            교사용 가이드
          </Link>
        </HStack>
      }
    />
  );

  return (
    <AppShell topNav={topNav} contentPadding={0} height="auto" variant="section">
      <Layout
        height="auto"
        content={
          <LayoutContent padding={4}>
            <VStack gap={6}>
              <VStack gap={2}>
                <Heading level={1}>교사용 구조화 기록 내보내기</Heading>
                <Text type="large" color="secondary">
                  인증된 Vercel 배포에서 최소 수업 정보만 Markdown으로 만듭니다.
                </Text>
              </VStack>

              <Banner
                status="warning"
                title="Copilot 대화 전문은 자동으로 가져오지 않습니다"
                description="Copilot은 별도 출처의 iframe에서 실행되므로 이 웹 셸은 대화 내용을 읽을 수 없습니다. 아래 내보내기는 교사가 직접 입력한 학교급·학년·과목·단원과 개인정보를 제거한 구조화 상태만 포함합니다."
              />

              {authorization === 'checking' ? (
                <Banner
                  status="info"
                  title="교사 인증 상태 확인 중"
                  description="잠시만 기다려 주세요."
                />
              ) : null}

              {authorization === 'unconfigured' ? (
                <Banner
                  status="warning"
                  title="이 배포에서는 교사 내보내기를 사용할 수 없습니다"
                  description={IS_STATIC_EXPORT
                    ? 'GitHub Pages는 서버 인증 기능이 없는 정적 화면입니다. Vercel의 교사용 기록 화면을 이용하세요.'
                    : 'Vercel 서버에 교사 키 해시와 세션 비밀값이 설정되지 않았습니다. 일반 수업 화면은 계속 사용할 수 있습니다.'}
                />
              ) : null}

              {authorization === 'locked' ? (
                <Card padding={5}>
                  <form onSubmit={unlock}>
                    <VStack gap={4}>
                      <Heading level={2}>교사 키로 잠금 해제</Heading>
                      <Text color="secondary">
                        키는 서버에서만 확인하며 브라우저 저장소에 남기지 않습니다.
                        이 키는 안전 규칙을 해제하거나 교사 신원을 증명하지 않습니다.
                      </Text>
                      <FormLayout>
                        <TextInput
                          type="password"
                          label="교사 키"
                          value={teacherKey}
                          onChange={setTeacherKey}
                          isRequired
                          width="100%"
                        />
                      </FormLayout>
                      <Button
                        type="submit"
                        label="교사 기록 열기"
                        variant="primary"
                        isLoading={isUnlocking}
                        isDisabled={teacherKey.length === 0}
                      />
                    </VStack>
                  </form>
                </Card>
              ) : null}

              {authorization === 'authorized' ? (
                <Card padding={5}>
                  <form onSubmit={exportMarkdown}>
                    <VStack gap={5}>
                      <HStack gap={4} justify="between" wrap="wrap">
                        <VStack gap={1}>
                          <Heading level={2}>최소 수업 정보</Heading>
                          <Text color="secondary">
                            실명·학교명·학번·연락처는 입력하지 마세요.
                          </Text>
                        </VStack>
                        <Button label="교사 세션 잠그기" variant="ghost" onClick={lock} />
                      </HStack>
                      <FormLayout>
                        <HStack gap={3} wrap="wrap" align="end">
                          <TextInput
                            label="가명 학생 ID"
                            value={draft.pseudonymousStudentId}
                            onChange={value => setDraft(current => ({
                              ...current,
                              pseudonymousStudentId: value.toUpperCase(),
                            }))}
                            description="형식: RVS- 뒤 영문·숫자 6자. 실제 신원과 연결하지 마세요."
                            placeholder="RVS-ABC234"
                            isRequired
                          />
                          <Button
                            label="무작위 가명 만들기"
                            variant="secondary"
                            onClick={() => setDraft(current => ({
                              ...current,
                              pseudonymousStudentId: createPseudonymousStudentId(),
                            }))}
                          />
                        </HStack>
                        <Selector
                          label="학교급"
                          options={SCHOOL_OPTIONS}
                          value={draft.schoolLevel}
                          onChange={value => setDraft(current => ({
                            ...current,
                            schoolLevel: value as SchoolLevel,
                            grade: '',
                          }))}
                          placeholder="학교급 선택"
                          isRequired
                          width="100%"
                        />
                        <Selector
                          label="학년"
                          options={gradeOptions}
                          value={draft.grade}
                          onChange={value => setDraft(current => ({...current, grade: value}))}
                          placeholder="학년 선택"
                          isDisabled={!draft.schoolLevel}
                          disabledMessage="학교급을 먼저 선택하세요."
                          isRequired
                          width="100%"
                        />
                        <Selector
                          label="과목"
                          options={SUBJECT_OPTIONS.map(value => ({value, label: value}))}
                          value={draft.subject}
                          onChange={value => setDraft(current => ({...current, subject: value}))}
                          placeholder="과목 선택"
                          isRequired
                          width="100%"
                        />
                        <TextInput
                          label="현재 단원"
                          value={draft.unit}
                          onChange={value => setDraft(current => ({...current, unit: value}))}
                          description="서버는 단원 원문을 저장하지 않고 입력 여부만 내보냅니다."
                          isRequired
                          width="100%"
                        />
                        <CheckboxInput
                          label="교사용 프로파일 절 포함"
                          description="학년·과목·단원 입력 여부만 미검증 상태로 덧붙입니다. 능력·성격·오개념은 평가하지 않습니다."
                          value={draft.includeTeacherProfile}
                          onChange={value => setDraft(current => ({
                            ...current,
                            includeTeacherProfile: value,
                          }))}
                        />
                      </FormLayout>
                      <Button
                        type="submit"
                        label="Markdown 미리보기 만들기"
                        variant="primary"
                        isLoading={isExporting}
                        isDisabled={!canExport}
                      />
                    </VStack>
                  </form>
                </Card>
              ) : null}

              {notice ? (
                <Banner status="info" title="처리 상태" description={notice} />
              ) : null}

              {result ? (
                <Card padding={5}>
                  <VStack gap={4}>
                    <HStack gap={4} justify="between" wrap="wrap">
                      <VStack gap={1}>
                        <Heading level={2}>Markdown 미리보기</Heading>
                        <Text color="secondary">SHA-256: {result.sha256}</Text>
                      </VStack>
                      <Button
                        label="UTF-8 Markdown 저장"
                        variant="primary"
                        onClick={downloadMarkdown}
                      />
                    </HStack>
                    <Markdown headingLevelStart={3} contentWidth="100%">
                      {result.markdown}
                    </Markdown>
                  </VStack>
                </Card>
              ) : null}

              <Text color="secondary">
                /cso는 AI 보조 1차 점검이며 전문 보안감사를 대체하지 않습니다.
              </Text>
            </VStack>
          </LayoutContent>
        }
      />
    </AppShell>
  );
}
