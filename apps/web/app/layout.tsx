import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import {AppProviders} from '@/components/app-providers';

export const metadata: Metadata = {
  title: 'Reverse — 근거 기반 수업 데모',
  description:
    '학교급과 단원에 맞춘 다섯 개의 수업 시나리오를 검수하는 로컬 웹 데모',
};

export default function RootLayout({children}: Readonly<{children: ReactNode}>) {
  return (
    <html lang="ko" dir="ltr">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

