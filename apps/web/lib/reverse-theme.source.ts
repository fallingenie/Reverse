import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

export const reverseTheme = defineTheme({
  name: 'reverse',
  extends: neutralTheme,
  color: {
    accent: '#08767D',
    neutralStyle: 'neutral',
    contrast: 'standard',
  },
  typography: {
    scale: {base: 16, ratio: 1.18},
    body: {
      family: 'Noto Sans KR Variable',
      fallbacks:
        'Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif',
    },
    heading: {
      family: 'Noto Sans KR Variable',
      fallbacks:
        'Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif',
      weight: '600',
    },
  },
  radius: {base: 4, multiplier: 1},
  motion: {
    fast: 175,
    medium: 350,
    ratio: 0.75,
    easing: 'cubic-bezier(0.24, 1, 0.4, 1)',
  },
  components: {
    link: {
      base: {
        fontWeight: 'var(--font-weight-semibold)',
      },
    },
  },
});
