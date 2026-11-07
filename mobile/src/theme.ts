// Tokens copied from the web (client/src/styles/index.css :root) so both look like one product.
export const C = {
  brand: '#0E6E8C', brandDark: '#0A5770', brandSoft: '#E3F1F5',
  ink: '#0B1420', text: '#101825', muted: '#5F6E7E', faint: '#647383',
  bg: '#F4F7F9', surface: '#FFFFFF', line: '#DAE4EA', control: '#7F909C',
  ok: '#117540', okSoft: '#E6F4EC', warn: '#A44F0E', warnSoft: '#FDF1E7', danger: '#B53333', dangerSoft: '#FBEAEA',
  none: '#9AA6AF',
} as const;
export const R = { sm: 8, md: 12, lg: 16 } as const;
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
// Base 16 for body text: readable for everyone, scales with the system font size.
export const T = { small: 13, body: 16, h3: 18, h2: 20, h1: 24, display: 44 } as const;
