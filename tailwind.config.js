/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff8ff',
          100: '#ddf0ff',
          200: '#b3e0ff',
          300: '#6ec8ff',
          400: '#22aaf4',
          500: '#0891d8',
          600: '#0272b0',
          700: '#025b8e',
          800: '#064d75',
          900: '#0a3f62',
        },
        navy: {
          900: 'rgb(var(--navy-900) / <alpha-value>)',
          800: 'rgb(var(--navy-800) / <alpha-value>)',
          700: 'rgb(var(--navy-700) / <alpha-value>)',
          600: 'rgb(var(--navy-600) / <alpha-value>)',
          500: 'rgb(var(--navy-500) / <alpha-value>)',
          400: 'rgb(var(--navy-400) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Lato', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-brand': 'linear-gradient(135deg, #0891d8 0%, #22aaf4 100%)',
        'gradient-hero': 'linear-gradient(135deg, #0d1117 0%, #001d3d 50%, #0d1117 100%)',
      },
      boxShadow: {
        'brand': '0 0 20px rgba(8, 145, 216, 0.35)',
        'brand-lg': '0 0 40px rgba(8, 145, 216, 0.45)',
        'glow': '0 0 15px rgba(34, 170, 244, 0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
}

