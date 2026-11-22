/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', bg2: 'var(--bg2)', bg3: 'var(--bg3)', input: 'var(--input)', line: 'var(--line)',
        fg: 'var(--fg)', fg2: 'var(--fg2)', fg3: 'var(--fg3)', accent: 'var(--accent)', 'accent-fg': 'var(--accent-fg)',
        add: 'var(--add)', del: 'var(--del)', warn: 'var(--warn)'
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace']
      },
      fontSize: { '2xs': ['11px', '14px'] },
      borderRadius: { xl: '12px', '2xl': '16px' }
    }
  },
  plugins: []
}
