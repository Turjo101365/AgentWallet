/** @type {import('tailwindcss').Config} */
// Design language: dark frame, warm canvas, pastel cards and editorial Inter Tight typography.
// `slate` is remapped to a warm neutral scale so every existing page picks up the new palette.
const neutral = {
  50: '#f6f6f2',
  100: '#eeeee9',
  200: '#e2e2dc',
  300: '#cdcdc5',
  400: '#84847b', // >= 3.6:1 on white, used only for secondary labels
  500: '#64645c', // >= 5.6:1 on white
  600: '#4f4f48',
  700: '#3a3a35',
  800: '#262622',
  900: '#161614',
};

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        slate: neutral,
        ink: { DEFAULT: '#121411', 2: '#1c1f1b', 3: '#2b2f2a' },
        canvas: '#ecece6',
        mint: { DEFAULT: '#d6efdf', soft: '#e8f6ed', deep: '#0e5236' },
        lilac: { DEFAULT: '#e4def5', soft: '#f1eefa', deep: '#3f2d78' },
        butter: { DEFAULT: '#f5ebc0', soft: '#faf5df', deep: '#5e4a06' },
        sky: { DEFAULT: '#d8e7f4', soft: '#ebf3fa', deep: '#153f66' },
        blush: { DEFAULT: '#f5ddd5', soft: '#fbefeb', deep: '#86270f' },
        primary: '#121411',
        'primary-container': '#2b2f2a',
        'primary-fixed': '#d6efdf',
        'primary-fixed-dim': '#b7e2c7',
        secondary: '#2b2f2a',
        'secondary-container': '#d6efdf',
        tertiary: '#3a8a63',
        'tertiary-container': '#b7e2c7',
        surface: '#ecece6',
        'surface-bright': '#f6f6f2',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f6f6f2',
        'surface-container': '#eeeee9',
        'surface-container-high': '#e2e2dc',
        'surface-container-highest': '#cdcdc5',
        'on-surface': '#121411',
        'on-surface-variant': '#4f4f48',
        outline: '#84847b',
        'outline-variant': '#d6d6cf',
        error: '#a3260f',
        'error-container': '#f5ddd5',
        background: '#ecece6',
      },
      fontFamily: {
        display: ["'Inter Tight'", "'Inter'", 'system-ui', 'sans-serif'],
        sans: ["'Inter Tight'", "'Inter'", 'system-ui', 'sans-serif'],
        mono: ["'JetBrains Mono'", 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        card: '0 1px 1px rgba(18, 20, 17, 0.03), 0 8px 24px -12px rgba(18, 20, 17, 0.10)',
        floating: '0 24px 48px -16px rgba(18, 20, 17, 0.28), 0 6px 16px -6px rgba(18, 20, 17, 0.14)',
      },
      keyframes: {
        rise: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'none' } },
        ping2: { '0%': { transform: 'scale(1)', opacity: '0.55' }, '80%,100%': { transform: 'scale(2.4)', opacity: '0' } },
      },
      animation: {
        rise: 'rise .45s cubic-bezier(.2,.7,.2,1) both',
        ping2: 'ping2 1.8s cubic-bezier(0,0,.2,1) infinite',
      },
    },
  },
  plugins: [],
};
