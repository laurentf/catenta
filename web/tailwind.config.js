/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      // Palette echantillonnee directement dans les slides du projet
      // (docs/Slides_tech_Passeport_Dentaire.pdf) — voir web/README.md.
      colors: {
        teal: {
          DEFAULT: '#0F766E',
          deep: '#0B5B54',
          accent: '#27BDAD',
          soft: '#E5F4F1',
          mist: '#EAFAF5',
        },
        navy: {
          DEFAULT: '#0F2540',
          soft: '#52606D',
        },
        slate: {
          muted: '#94A3B8',
          label: '#6B7280',
          line: '#E2E8F0',
          panel: '#F2F4F6',
        },
        peach: '#FCEDE6',
        lime: '#EDF5DE',
        amber: { deep: '#B45309' },
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 37, 64, 0.04)',
        lift: '0 8px 24px rgba(15, 37, 64, 0.08)',
      },
    },
  },
  plugins: [],
}
