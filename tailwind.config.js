/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0d0e14',
        surface: '#1f2937',
        primary: {
          DEFAULT: '#a855f7',
          dark: '#9333ea',
          light: '#c084fc',
        },
        foreground: '#f9fafb',
        muted: '#9ca3af',
      },
      keyframes: {
        'gradient-xy': {
          '0%, 100%': {
            'background-size': '400% 400%',
            'background-position': 'left center',
          },
          '50%': {
            'background-size': '200% 200%',
            'background-position': 'right center',
          },
        },
      },
      animation: {
        'gradient-xy': 'gradient-xy 15s ease infinite',
      },
    },
  },
  plugins: [],
};
