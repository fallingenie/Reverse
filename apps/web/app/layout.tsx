import type {Metadata, Viewport} from 'next';
import type {ReactNode} from 'react';
import '@fontsource-variable/noto-sans-kr';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import {AppProviders} from '@/components/app-providers';

export const metadata: Metadata = {
  title: 'Reverse — 근거 기반 수업',
  description:
    'Microsoft Copilot Studio의 Reverse 에이전트를 사용하는 근거 기반 수업 화면',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
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
