'use client';

import type {ReactNode} from 'react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import '@astryxdesign/theme-neutral/theme.css';
import {astryxKoreanMessages} from '@/lib/astryx-ko';

export function AppProviders({children}: Readonly<{children: ReactNode}>) {
  return (
    <Theme theme={neutralTheme} mode="system">
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
