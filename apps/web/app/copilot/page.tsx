import type {Metadata} from 'next';
import {CopilotExperience} from '@/components/copilot-experience';

export const metadata: Metadata = {
  title: 'Copilot 체험 — Reverse',
  description: 'Microsoft Copilot Studio에서 제공하는 Reverse WebChat 체험',
};

export default function CopilotPage() {
  return <CopilotExperience />;
}
