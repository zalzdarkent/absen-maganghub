/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: '#0d1117',
        panel: '#131a22',
        'panel-alt': '#161f29',
        border: '#24303c',
        text: '#e6edf3',
        muted: '#8b949e',
        green: '#3fb950',
        red: '#f85149',
        amber: '#d29922',
        blue: '#58a6ff',
      },
    },
  },
  plugins: [],
};
