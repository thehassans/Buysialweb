/******************************************************************************
 * Tailwind CSS configuration for Buysial (Vite + React)
 * - Scans index.html and all files under src/
 * - Disables preflight to avoid clashing with existing design system for now
 *   (we can enable later once migrated)
 ******************************************************************************/
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'ui-sans-serif', 'Segoe UI', 'Roboto', 'Ubuntu', 'Cantarell', 'Noto Sans', 'sans-serif'],
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '10px',
        md: '12px',
        lg: '18px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,.06)',
        md: '0 4px 16px rgba(0,0,0,.12)',
      },
    },
  },
  corePlugins: {
    preflight: false,
  },
};
