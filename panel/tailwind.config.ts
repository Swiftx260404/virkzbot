import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        panel: {
          background: '#0f172a',
          surface: '#111c3a',
          border: '#1e293b',
          accent: '#38bdf8',
          muted: '#475569',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};

export default config;
