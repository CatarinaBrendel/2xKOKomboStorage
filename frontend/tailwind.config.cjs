module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          default: '#0D0D0F',
          panel: '#1C1C1E',
          hover: '#242428',
          border: '#2C2C2E'
        },
        text: {
          DEFAULT: '#F2F2F7',
          muted: '#A1A1AA',
          alt: '#FFFFFF'
        },
        accent: {
          primary: '#3A8DFF',
          secondary: '#2AC7F5',
          danger: '#E24C4B',
          success: '#22C55E'
        },
        btn: {
          light: '#F7C948',
          medium: '#E05297',
          heavy: '#A454F6',
          special: '#1FD1F9',
          direction: '#FFFFFF'
        }
      }
    },
  },
  plugins: [],
}
