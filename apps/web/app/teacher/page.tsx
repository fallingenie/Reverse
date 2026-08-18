import type {Metadata} from 'next';
import {TeacherExportWorkspace} from '@/components/teacher-export-workspace';

export const metadata: Metadata = {
  title: 'Reverse 교사 기록',
  description: '인증된 교사가 최소 수업 정보를 Markdown으로 내보내는 화면입니다.',
};

export default function TeacherExportPage() {
  return <TeacherExportWorkspace />;
}
