'use client';

import type {ReactNode} from 'react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {astryxKoreanMessages} from '@/lib/astryx-ko';

export function AppProviders({children}: Readonly<{children: ReactNode}>) {
  return (
    <InternationalizationProvider
      locale="ko"
      dir="ltr"
      messages={{ko: astryxKoreanMessages}}
    >
      {children}
    </InternationalizationProvider>
  );
}

