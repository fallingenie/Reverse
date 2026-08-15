'use client';

import type {ReactNode} from 'react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {Theme} from '@astryxdesign/core/theme';
import {reverseTheme} from '@/lib/reverse';
import '@/lib/reverse.css';
import {astryxKoreanMessages} from '@/lib/astryx-ko';

export function AppProviders({children}: Readonly<{children: ReactNode}>) {
  return (
    <Theme theme={reverseTheme} mode="light">
      <InternationalizationProvider
        locale="ko"
        dir="ltr"
        messages={{ko: astryxKoreanMessages}}
      >
        {children}
      </InternationalizationProvider>
    </Theme>
  );
}
