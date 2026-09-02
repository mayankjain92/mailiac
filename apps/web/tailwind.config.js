/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'background': '#F2F2EE',
        'dark-bg': '#0E1210',
        'surface': '#EAEAE5',
        'surface-low': '#E4E4DF',
        'surface-container': '#DDDCD7',
        'surface-border': '#D5D5CE',
        'on-surface': '#1a1c1c',
        'on-surface-variant': '#434656',
        'primary': '#0052ff',
        'error': '#ba1a1a',
      },
      fontFamily: {
        sans: ['Hanken Grotesk', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Hanken Grotesk', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
