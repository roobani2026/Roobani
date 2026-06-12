/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      borderRadius: {
        none: '0px',
        lg: '0px',
        md: '0px',
        sm: '0px',
        DEFAULT: '0px',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        rb: {
          // Theme-aware tokens (resolved via CSS variables defined in index.css)
          bg: 'var(--rb-bg)',
          bg2: 'var(--rb-bg-2)',
          text: 'var(--rb-text)',
          text2: 'var(--rb-text-2)',
          border: 'var(--rb-border)',
          card: 'var(--rb-card)',
          heading: 'var(--rb-heading)',
          // Brand-fixed (do not swap between light/dark)
          navy: '#1A1F3D',
          gold: '#C9A84C',
          teal: '#2A9D8F',
          success: '#3A7D5C',
          alert: '#C0392B',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'DM Serif Display', 'serif'],
        serif: ['Fraunces', 'serif'],
        sans: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
