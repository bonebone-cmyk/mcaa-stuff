import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), 'surface-2': v('surface-2'), line: v('line'),
        fg: v('fg'), muted: v('muted'), accent: v('accent'), 'accent-fg': v('accent-fg'),
        win: v('win'), loss: v('loss'), gold: v('gold'),
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / 0.25), 0 8px 24px -12px rgb(0 0 0 / 0.35)' },
      keyframes: {
        fadein: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        pulseLive: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
      animation: { fadein: 'fadein .35s ease-out both', live: 'pulseLive 1.4s ease-in-out infinite' },
    },
  },
  plugins: [],
} satisfies Config;
