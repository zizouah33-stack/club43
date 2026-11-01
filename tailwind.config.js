/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0B1F3F',
        ink: '#122846',
        blue: '#1E88E5',
        'light-blue': '#6EB9FF',
        gold: '#D4A93C',
        teal: '#178C8C',
        sand: '#F6F4EF',
        muted: '#64748B',
      },
    },
  },
  plugins: [],
};
