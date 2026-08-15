import {Card} from '@astryxdesign/core/Card';
import {HStack} from '@astryxdesign/core/HStack';
import {Heading} from '@astryxdesign/core/Heading';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function LicenseNotice() {
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
