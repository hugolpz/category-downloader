/** Layout utilities only (preflight off to keep Codex base styles). Colours point at the CSS variables in styles/theme.css. */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        paper: 'var(--surface)',
        card: 'var(--surface-card)',
        sunken: 'var(--surface-sunken)',
        ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)', 3: 'var(--ink-3)' },
        line: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
        forest: { DEFAULT: 'var(--forest)', deep: 'var(--forest-deep)', light: 'var(--forest-light)', tint: 'var(--forest-tint)' },
        leaf: 'var(--leaf)',
        maize: { DEFAULT: 'var(--maize)', tint: 'var(--maize-tint)', deep: 'var(--gold-deep)' },
        terracotta: { DEFAULT: 'var(--terracotta)', tint: 'var(--terracotta-tint)' },
      },
      fontFamily: { display: ['var(--font-display)'], body: ['var(--font-body)'] },
      borderRadius: { xl: 'var(--radius-xl)' },
    },
  },
};
