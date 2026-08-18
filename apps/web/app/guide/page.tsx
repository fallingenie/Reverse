import type {Metadata} from 'next';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack} from '@astryxdesign/core/HStack';
import {Heading} from '@astryxdesign/core/Heading';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {Text} from '@astryxdesign/core/Text';
import {Token} from '@astryxdesign/core/Token';
import {TopNav, TopNavHeading} from '@astryxdesign/core/TopNav';
import {VStack} from '@astryxdesign/core/VStack';

const VERCEL_URL = 'https://reverse-education-beta.vercel.app/';
const TEACHER_URL = 'https://reverse-education-beta.vercel.app/teacher/';
const PAGES_URL = 'https://fallingenie.github.io/Reverse/';
const REPOSITORY_URL = 'https://github.com/fallingenie/Reverse';
const GUIDE_URL = `${REPOSITORY_URL}/blob/main/docs/TEACHER_GUIDE.md`;
const PRIVACY_URL = `${REPOSITORY_URL}/blob/main/docs/PRIVACY.md`;

export const metadata: Metadata = {
  title: 'Reverse 교사용 가이드',
  description: '설치 없이 Reverse를 시작하는 교사를 위한 단계별 안내입니다.',
};

export default function TeacherGuidePage() {
  const topNav = (
    <TopNav
      label="Reverse 교사용 가이드 주요 탐색"
      heading={<TopNavHeading heading="Reverse" subheading="교사용 가이드" />}
      endContent={
        <HStack gap={4} wrap="wrap">
          <ClickableCard
            label="수업 화면 열기"
            href={VERCEL_URL}
            variant="transparent"
            padding={3}
          >
            <Text weight="semibold">수업 화면 열기</Text>
          </ClickableCard>
          <ClickableCard
            label="GitHub 문서 열기"
            href={REPOSITORY_URL}
            variant="transparent"
            padding={3}
          >
            <Text weight="semibold">GitHub 문서</Text>
          </ClickableCard>
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
                <Heading level={1}>설치 없이 수업을 시작하세요</Heading>
                <Text type="large" color="secondary">
                  컴퓨터 명령어를 몰라도 됩니다. 웹 주소를 열고 학교급, 학년,
                  과목과 단원을 차례로 입력하면 됩니다.
                </Text>
              </VStack>

              <Banner
                status="info"
                title="가장 쉬운 방법은 Vercel 수업 화면입니다"
                description="GitHub 저장소를 내려받거나 프로그램을 설치할 필요가 없습니다. Microsoft 로그인이나 조직 권한을 요구하면 학교·기관의 업무용 또는 교육용 계정을 사용하세요."
                endContent={
                  <ClickableCard
                    label="Vercel에서 시작하기"
                    href={VERCEL_URL}
                    variant="transparent"
                    padding={3}
                  >
                    <Text weight="semibold">Vercel에서 시작하기</Text>
                  </ClickableCard>
                }
              />

              <Card padding={5}>
                <VStack gap={4}>
                  <Heading level={2}>처음 사용: 수업 시작 순서와 사용 전 준비</Heading>
                  <List density="spacious" hasDividers>
                    <ListItem
                      label="1. 웹 화면을 엽니다"
                      description="Vercel 주소를 열면 게시된 Copilot 에이전트가 화면 안에 나타납니다."
                    />
                    <ListItem
                      label="2. 허용된 계정으로 로그인합니다"
                      description="개인용 계정이 아니라 학교나 기관에서 허용한 업무·교육용 계정을 사용합니다."
                    />
                    <ListItem
                      label="3. 학교급부터 차례로 답합니다"
                      description="학교급, 학년, 과목, 현재 공부 중인 단원을 입력합니다. 단원이 수업의 중심 주제가 됩니다."
                    />
                    <ListItem
                      label="4. 학생에게 보여 주기 전에 확인합니다"
                      description="교사가 먼저 같은 조건으로 체험하고 사실, 출처, 학년 수준, 안전성을 확인합니다."
                    />
                  </List>
                </VStack>
              </Card>

              <VStack gap={3}>
                <Heading level={2}>화면별 차이</Heading>
                <Grid columns={{minWidth: 280, max: 3, repeat: 'fit'}} gap={4}>
                  <ClickableCard
                    label="Vercel 수업 화면 열기"
                    href={VERCEL_URL}
                    padding={5}
                  >
                    <VStack gap={3}>
                      <HStack gap={2} wrap="wrap">
                        <Heading level={3}>Vercel</Heading>
                        <Token label="권장" color="green" />
                      </HStack>
                      <Text color="secondary">
                        일반 수업 체험에 사용합니다. 교사 내보내기는 서버의 보안
                        설정이 완료된 배포에서만 열립니다.
                      </Text>
                      <Text weight="semibold" color="accent">Vercel 화면 열기 →</Text>
                    </VStack>
                  </ClickableCard>

                  <ClickableCard
                    label="GitHub Pages 화면 열기"
                    href={PAGES_URL}
                    padding={5}
                  >
                    <VStack gap={3}>
                      <Heading level={3}>GitHub Pages</Heading>
                      <Text color="secondary">
                        서버 기능이 없는 대체 화면입니다. 교사 키 확인과 Markdown
                        내보내기는 사용할 수 없습니다.
                      </Text>
                      <Text weight="semibold" color="accent">GitHub Pages 열기 →</Text>
                    </VStack>
                  </ClickableCard>

                  <ClickableCard
                    label="GitHub의 자세한 교사용 가이드 열기"
                    href={GUIDE_URL}
                    padding={5}
                  >
                    <VStack gap={3}>
                      <Heading level={3}>GitHub 문서</Heading>
                      <Text color="secondary">
                        문서, 라이선스, 변경 이력을 확인하는 곳입니다. 수업 체험을
                        위해 소스 코드를 내려받을 필요는 없습니다.
                      </Text>
                      <Text weight="semibold" color="accent">자세한 교사용 가이드 →</Text>
                    </VStack>
                  </ClickableCard>

                  <ClickableCard
                    label="Vercel 교사 기록 화면 열기"
                    href={TEACHER_URL}
                    padding={5}
                  >
                    <VStack gap={3}>
                      <Heading level={3}>교사 기록</Heading>
                      <Text color="secondary">
                        서버 설정이 완료된 Vercel 배포에서 교사 키로 최소 수업 정보를
                        Markdown으로 내보냅니다.
                      </Text>
                      <Text weight="semibold" color="accent">교사 기록 화면 열기 →</Text>
                    </VStack>
                  </ClickableCard>
                </Grid>
              </VStack>

              <Card variant="muted" padding={5}>
                <VStack gap={3}>
                  <Heading level={2}>로그인이나 권한 오류가 나오면</Heading>
                  <Text>
                    오류 화면을 반복해서 새로 고치지 마세요. 삽입 화면의 새 창
                    열기를 먼저 시도한 뒤, 계속 막히면 학교 정보 담당자에게
                    개인정보를 가린 화면과 발생 시각을 전달하세요.
                  </Text>
                  <Text color="secondary">
                    Reverse는 Microsoft 계정 권한, 조직의 공유 정책, Copilot Studio
                    환경을 바꿀 수 없습니다. 다른 기관에서 사용할 때는 그 기관의
                    관리자 승인과 실제 계정 시험이 필요합니다.
                  </Text>
                </VStack>
              </Card>

              <Banner
                status="warning"
                title="실제 학생 개인정보를 입력하지 마세요"
                description="실명, 학교명, 학번, 연락처, 건강·장애, 상담, 가족·경제 정보를 대화·PDF·교사 기록에 넣지 않습니다. 학생을 구분해야 한다면 원래 신원을 짐작할 수 없는 가명 ID만 사용하세요."
                endContent={
                  <ClickableCard
                    label="개인정보 안내 열기"
                    href={PRIVACY_URL}
                    variant="transparent"
                    padding={3}
                  >
                    <Text weight="semibold">개인정보 안내</Text>
                  </ClickableCard>
                }
              />

              <ClickableCard
                label="Vercel 교사 기록 화면 열기"
                href={TEACHER_URL}
                padding={5}
              >
                <VStack gap={3}>
                  <Heading level={2}>교사 기록과 내보내기</Heading>
                  <Text>
                    학생이 실제로 선택하거나 말한 내용만 기록합니다. 에이전트가
                    제안한 행동을 학생의 성취로 바꾸거나, 한 번의 선택으로 능력·성격·
                    오개념을 확정하지 않습니다.
                  </Text>
                  <Text color="secondary">
                    GitHub Pages의 현재 공개 화면에는 교사 프로필 편집이나 Markdown 내보내기
                    버튼이 없습니다. Vercel의 교사 기록 화면은 서버 설정이 완료된 경우에만
                    교사 키로 열립니다. Copilot 대화 전문은 별도 출처의 iframe이라 자동으로
                    가져오지 않으며, 교사가 입력한 최소 수업 정보만 구조화해 내보냅니다.
                    교사 키는 안전 규칙을 해제하거나 교사 신원을 증명하는 권한이 아닙니다.
                  </Text>
                  <Text weight="semibold" color="accent">Vercel 교사 기록 화면 →</Text>
                </VStack>
              </ClickableCard>

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
