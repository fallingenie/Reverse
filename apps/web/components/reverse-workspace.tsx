'use client';

import {useState} from 'react';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {HStack} from '@astryxdesign/core/HStack';
import {
  Layout,
  LayoutContent,
} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {TopNav, TopNavHeading} from '@astryxdesign/core/TopNav';
import {VStack} from '@astryxdesign/core/VStack';
import {StudentOnboarding} from '@/components/student-onboarding';
import {TeacherReview} from '@/components/teacher-review';
import {INITIAL_SESSION, type LessonSession} from '@/lib/session';

type WorkspaceTab = 'student' | 'teacher';

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const localRunCommand = `git clone https://github.com/fallingenie/Reverse.git
cd Reverse/apps/web
corepack enable
pnpm install --frozen-lockfile
pnpm dev`;
const vercelDeployUrl =
  'https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffallingenie%2FReverse&project-name=reverse-education-beta&repository-name=Reverse&root-directory=apps%2Fweb';

function QuickStart() {
  return (
    <Card variant="muted" padding={5}>
      <VStack gap={4}>
        <VStack gap={2}>
          <Heading level={2}>바로 실행하기</Heading>
          <Text color="secondary">
            아래 명령을 터미널에 그대로 붙여 넣거나, 링크를 눌러 설치 안내와
            배포 화면을 여세요.
          </Text>
        </VStack>
        <CodeBlock
          code={localRunCommand}
          language="bash"
          title="로컬 실행"
          hasLineNumbers={false}
          hasCopyButton
          isWrapped
          width="100%"
        />
        <HStack gap={4} wrap="wrap">
          <Link
            href={vercelDeployUrl}
            hasUnderline
            isExternalLink
            isStandalone
            newTabLabel="새 탭에서 열림"
          >
            Vercel에 바로 배포
          </Link>
          <Link
            href="https://github.com/fallingenie/Reverse"
            hasUnderline
            isExternalLink
            isStandalone
            newTabLabel="새 탭에서 열림"
          >
            GitHub 저장소
          </Link>
          <Link
            href="https://github.com/fallingenie/Reverse/blob/agent/runtime-profiles/START-HERE.md"
            hasUnderline
            isExternalLink
            isStandalone
            newTabLabel="새 탭에서 열림"
          >
            초보자 빠른 시작
          </Link>
          <Link
            href="https://github.com/fallingenie/Reverse/blob/agent/runtime-profiles/copilot/IT-ADMIN-QUICK-START.md"
            hasUnderline
            isExternalLink
            isStandalone
            newTabLabel="새 탭에서 열림"
          >
            Copilot 설치 안내
          </Link>
          <Link
            href="https://github.com/fallingenie/Reverse/actions/workflows/pages.yml"
            hasUnderline
            isExternalLink
            isStandalone
            newTabLabel="새 탭에서 열림"
          >
            Pages 배포 상태
          </Link>
        </HStack>
      </VStack>
    </Card>
  );
}

function LicenseNotice() {
  return (
    <Card variant="muted" padding={5}>
      <VStack gap={2}>
        <Heading level={2}>라이선스와 원 저작자</Heading>
        <Text color="secondary">
          Reverse는 Apache License 2.0으로 배포됩니다. Copyright 2026
          fallingenie.
        </Text>
        <Text color="secondary">
          교육용 재설계의 참고 원본은 Singulari-Tea Codex: A Modular
          Architecture for Dynamic Narrative Simulation, Copyright 2025
          fewweekslater (lemos999)입니다. 원본도 Apache License 2.0을
          따릅니다.
        </Text>
        <HStack gap={4} wrap="wrap">
          <Link href={`${publicBasePath}/LICENSE`} hasUnderline isStandalone>
            라이선스
          </Link>
          <Link href={`${publicBasePath}/NOTICE`} hasUnderline isStandalone>
            고지
          </Link>
          <Link
            href="https://www.apache.org/licenses/LICENSE-2.0"
            hasUnderline
            isExternalLink
            isStandalone
            newTabLabel="새 탭에서 열림"
          >
            Apache License 2.0 전문
          </Link>
          <Link
            href="https://github.com/lemos999/Singulari-Tea-Codex-Prompt-for-Gemini"
            hasUnderline
            isExternalLink
            isStandalone
            newTabLabel="새 탭에서 열림"
          >
            Singulari-Tea Codex 원본 저장소
          </Link>
        </HStack>
      </VStack>
    </Card>
  );
}

export function ReverseWorkspace() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('student');
  const [session, setSession] = useState<LessonSession>(INITIAL_SESSION);

  const topNav = (
    <TopNav
      label="Reverse 주요 탐색"
      heading={
        <TopNavHeading
          heading="Reverse"
          subheading="근거 기반 수업 데모"
        />
      }
      endContent={
        <Link
          href="https://github.com/fallingenie/Reverse"
          hasUnderline
          isExternalLink
          isStandalone
          newTabLabel="새 탭에서 열림"
        >
          GitHub
        </Link>
      }
    />
  );

  const demoBanner = (
    <Banner
      container="section"
      status="info"
      title="로컬 데모"
      description="현재 웹 버전은 백엔드·LLM·웹 검색에 연결되지 않았습니다. 입력은 브라우저 메모리에만 머물며 새로고침하면 사라집니다."
      endContent={
        <HStack gap={4} wrap="wrap">
          <Link
            href={vercelDeployUrl}
            hasUnderline
            isExternalLink
            isStandalone
            newTabLabel="새 탭에서 열림"
          >
            Vercel 배포
          </Link>
          <Link
            href="https://github.com/fallingenie/Reverse"
            hasUnderline
            isExternalLink
            isStandalone
            newTabLabel="새 탭에서 열림"
          >
            GitHub 저장소
          </Link>
        </HStack>
      }
    />
  );

  return (
    // 반응형 계약: 넓은 화면은 단일 중앙 열, 좁은 화면은 Astryx Grid와 Stack이 한 열로 접습니다.
    <AppShell
      topNav={topNav}
      banner={demoBanner}
      contentPadding={0}
      height="auto"
      variant="section"
    >
      <Layout
        height="auto"
        content={
          <LayoutContent padding={4}>
            <VStack gap={6}>
              <VStack gap={2}>
                <Heading level={1}>근거 기반 수업 시뮬레이터</Heading>
                <Text type="large" color="secondary">
                  학생의 현재 단원에서 출발하고, 교사는 근거와 가정을 따로
                  검수합니다.
                </Text>
              </VStack>

              <QuickStart />

              <TabList
                value={activeTab}
                onChange={value => setActiveTab(value as WorkspaceTab)}
                hasDivider
                layout="fill"
                size="lg"
              >
                <Tab value="student" label="학생 수업" />
                <Tab value="teacher" label="교사 검수" />
              </TabList>

              {activeTab === 'student' ? (
                <StudentOnboarding session={session} onChange={setSession} />
              ) : (
                <TeacherReview session={session} />
              )}

              <LicenseNotice />
            </VStack>
          </LayoutContent>
        }
      />
    </AppShell>
  );
}
