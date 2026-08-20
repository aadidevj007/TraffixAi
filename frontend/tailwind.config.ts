import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          50:  '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
          950: '#083344',
        },
        neon: {
          amber:  '#f59e0b',
          orange: '#f97316',
          yellow: '#eab308',
          green:  '#22c55e',
          blue:   '#3b82f6',
          violet: '#8b5cf6',
          pink:   '#ec4899',
        },
        space: {
          950: '#020408',
          900: '#030711',
          850: '#050d1a',
          800: '#070f1f',
          700: '#0a1628',
          600: '#0d1f38',
          500: '#112848',
          400: '#1a3a60',
          300: '#254d7a',
        },
        accent: {
          cyan:    '#06b6d4',
          amber:   '#f59e0b',
          crimson: '#dc2626',
          violet:  '#8b5cf6',
          emerald: '#10b981',
        },
        dark: {
          900: '#020408',
          800: '#030711',
          700: '#050d1a',
          600: '#070f1f',
          500: '#0a1628',
        },
      },
      fontFamily: {
        sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
        brand:   ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-jetbrains-mono)', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow':   'pulse 3s ease-in-out infinite',
        'float':        'float 6s ease-in-out infinite',
        'glow-cyan':    'glowCyan 2s ease-in-out infinite alternate',
        'glow-amber':   'glowAmber 2s ease-in-out infinite alternate',
        'slide-up':     'slideUp 0.5s ease-out',
        'fade-in':      'fadeIn 0.5s ease-out',
        'spin-slow':    'spin 8s linear infinite',
        'scan':         'scan 3s linear infinite',
        'data-stream':  'dataStream 2s linear infinite',
        'shimmer-holo': 'shimmerHolo 3s linear infinite',
        'ping-slow':    'ping 3s cubic-bezier(0,0,0.2,1) infinite',
        'border-spin':  'borderSpin 4s linear infinite',
        'matrix-rain':  'matrixRain 20s linear infinite',
        'radar-sweep':  'radarSweep 4s linear infinite',
        'counter':      'counter 0.6s ease-out both',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':       { transform: 'translateY(-16px)' },
        },
        glowCyan: {
          from: { boxShadow: '0 0 8px rgba(6,182,212,0.4), 0 0 20px rgba(6,182,212,0.2)' },
          to:   { boxShadow: '0 0 20px rgba(6,182,212,0.8), 0 0 60px rgba(6,182,212,0.35)' },
        },
        glowAmber: {
          from: { boxShadow: '0 0 8px rgba(245,158,11,0.4), 0 0 20px rgba(245,158,11,0.2)' },
          to:   { boxShadow: '0 0 20px rgba(245,158,11,0.8), 0 0 60px rgba(245,158,11,0.35)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(30px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        scan: {
          '0%':   { transform: 'translateY(-100%)', opacity: '0' },
          '10%':  { opacity: '1' },
          '90%':  { opacity: '1' },
          '100%': { transform: 'translateY(100vh)', opacity: '0' },
        },
        dataStream: {
          '0%':   { transform: 'translateY(0) scaleY(0)', opacity: '0' },
          '20%':  { opacity: '1', transform: 'translateY(0) scaleY(1)' },
          '80%':  { opacity: '1' },
          '100%': { transform: 'translateY(-100px) scaleY(1)', opacity: '0' },
        },
        shimmerHolo: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        borderSpin: {
          '0%':   { backgroundPosition: '0% 50%' },
          '50%':  { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        matrixRain: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        radarSweep: {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        counter: {
          from: { opacity: '0', transform: 'translateY(10px) scale(0.9)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      backgroundImage: {
        'gradient-radial':   'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':    'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'hero-gradient':     'linear-gradient(135deg, #020408 0%, #050d1a 40%, #070f1f 70%, #020408 100%)',
        'cyber-gradient':    'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, transparent 50%)',
        'card-gradient':     'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
        'neon-border':       'linear-gradient(90deg, #06b6d4, #8b5cf6, #f59e0b, #06b6d4)',
        'holo-shimmer':      'linear-gradient(90deg, transparent, rgba(6,182,212,0.3), rgba(139,92,246,0.2), transparent)',
      },
      backdropBlur: {
        xs:  '2px',
        '2xl': '40px',
        '3xl': '60px',
      },
      boxShadow: {
        'glow-cyan':   '0 0 30px rgba(6,182,212,0.5), 0 0 60px rgba(6,182,212,0.2)',
        'glow-amber':  '0 0 30px rgba(245,158,11,0.5), 0 0 60px rgba(245,158,11,0.2)',
        'glow-violet': '0 0 30px rgba(139,92,246,0.5), 0 0 60px rgba(139,92,246,0.2)',
        'glow-red':    '0 0 30px rgba(220,38,38,0.5), 0 0 60px rgba(220,38,38,0.2)',
        'cyber':       '0 0 0 1px rgba(6,182,212,0.3), 0 20px 60px rgba(0,0,0,0.5)',
        'glass':       '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        'card':        '0 4px 6px -1px rgba(0,0,0,0.5), 0 2px 4px -1px rgba(0,0,0,0.2)',
        'panel':       '0 25px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
        'hud':         '0 0 0 1px rgba(6,182,212,0.2), 0 4px 24px rgba(6,182,212,0.1), inset 0 1px 0 rgba(6,182,212,0.05)',
      },
    },
  },
  plugins: [],
}

export default config
