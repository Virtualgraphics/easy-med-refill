/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // 'class' lets the in-app Appearance setting control dark mode; 'system' still follows the device.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Royal blue from the logo (brand-600 is the logo fill).
        brand: {
          50: '#EAF3FB',
          100: '#D2E6F6',
          200: '#A6CDEC',
          300: '#6FAEDF',
          400: '#3C8DD0',
          500: '#1A71C0',
          600: '#0B5CAB',
          700: '#094B8C',
          800: '#073B6E',
          900: '#052A4F',
        },
        // Cyan / mint from the background gradient.
        accent: {
          50: '#EEF9F7',
          100: '#DDF5F6',
          200: '#B6ECF0',
          300: '#8CE0E8',
          400: '#5FD3DF',
          500: '#3EC6D6',
          600: '#22A8B9',
          700: '#1A8594',
        },
        // Supply status (runway) colours.
        status: {
          ok: '#16A34A',
          warn: '#F59E0B',
          critical: '#DC2626',
        },
      },
    },
  },
  plugins: [],
};
