import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

export const reverseTheme = defineTheme({
  name: 'reverse',
  extends: neutralTheme,
  color: {
    accent: '#08767D',
    neutralStyle: 'warm',
    contrast: 'standard',
  },
  tokens: {
    '--color-background-body': ['#F4EFE5', '#091314'],
    '--color-background-surface': ['#FFFCF6', '#122021'],
    '--color-background-card': ['#FFFCF6', '#122021'],
    '--color-background-popover': ['#FFFCF6', '#1B2A2B'],
    '--color-background-muted': ['#EAE2D5', '#243334'],
    '--color-text-primary': ['#142E32', '#E6F0EF'],
    '--color-text-secondary': ['#536568', '#A8BAB9'],
    '--color-border': ['#D9D0C3', '#334546'],
    '--color-border-emphasized': ['#A89D8E', '#5F7374'],
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
