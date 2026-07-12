/**
 * SVG chess piece sets and color palettes for the web board.
 * Paths are original Staunton-inspired silhouettes (viewBox 0 0 45 45).
 */

export const PIECE_SETS = {
  classic: {
    label: 'Classic',
    description: 'Filled Staunton silhouettes',
  },
  modern: {
    label: 'Modern',
    description: 'Softer geometric shapes',
  },
  blocks: {
    label: 'Blocks',
    description: 'Chunky stacked forms',
  },
  flat: {
    label: 'Flat',
    description: 'Solid fills, no outlines',
  },
  line: {
    label: 'Line',
    description: 'Stroke outlines',
  },
};

export const PIECE_PALETTES = {
  ivory: {
    label: 'Ivory & Ebony',
    whiteName: 'Ivory',
    blackName: 'Ebony',
    // Brighter ivory + deeper ebony so pieces stay distinct on warm boards.
    white: { fill: '#fffdf6', stroke: '#14100c', detail: '#14100c' },
    black: { fill: '#100c09', stroke: '#f7ecd8', detail: '#f7ecd8' },
  },
  scarlet: {
    label: 'Cream & Scarlet',
    whiteName: 'Cream',
    blackName: 'Scarlet',
    white: { fill: '#fff4ec', stroke: '#7f1d1d', detail: '#7f1d1d' },
    black: { fill: '#dc2626', stroke: '#450a0a', detail: '#fff1f2' },
  },
  sapphire: {
    label: 'Ice & Sapphire',
    whiteName: 'Ice',
    blackName: 'Sapphire',
    white: { fill: '#eff6ff', stroke: '#1e3a8a', detail: '#1e3a8a' },
    black: { fill: '#2563eb', stroke: '#172554', detail: '#dbeafe' },
  },
  emerald: {
    label: 'Foam & Emerald',
    whiteName: 'Foam',
    blackName: 'Emerald',
    white: { fill: '#ecfdf5', stroke: '#065f46', detail: '#065f46' },
    black: { fill: '#059669', stroke: '#022c22', detail: '#d1fae5' },
  },
  amethyst: {
    label: 'Lilac & Amethyst',
    whiteName: 'Lilac',
    blackName: 'Amethyst',
    white: { fill: '#f5f3ff', stroke: '#5b21b6', detail: '#5b21b6' },
    black: { fill: '#7c3aed', stroke: '#2e1065', detail: '#ede9fe' },
  },
  amber: {
    label: 'Butter & Copper',
    whiteName: 'Butter',
    blackName: 'Copper',
    white: { fill: '#fffbeb', stroke: '#9a3412', detail: '#9a3412' },
    black: { fill: '#ea580c', stroke: '#7c2d12', detail: '#ffedd5' },
  },
  mono: {
    label: 'White & Black',
    whiteName: 'White',
    blackName: 'Black',
    white: { fill: '#ffffff', stroke: '#111827', detail: '#111827' },
    black: { fill: '#111827', stroke: '#f9fafb', detail: '#f9fafb' },
  },
  solar: {
    label: 'Sun & Night',
    whiteName: 'Sun',
    blackName: 'Night',
    white: { fill: '#facc15', stroke: '#713f12', detail: '#713f12' },
    black: { fill: '#0f172a', stroke: '#fde68a', detail: '#fde68a' },
  },
  ocean: {
    label: 'Aqua & Navy',
    whiteName: 'Aqua',
    blackName: 'Navy',
    white: { fill: '#67e8f9', stroke: '#164e63', detail: '#164e63' },
    black: { fill: '#0e7490', stroke: '#083344', detail: '#cffafe' },
  },
  rose: {
    label: 'Blush & Magenta',
    whiteName: 'Blush',
    blackName: 'Magenta',
    white: { fill: '#fbcfe8', stroke: '#9d174d', detail: '#9d174d' },
    black: { fill: '#db2777', stroke: '#500724', detail: '#fce7f3' },
  },
  theme: {
    label: 'Match theme',
    whiteName: 'Light',
    blackName: 'Dark',
    white: {
      fill: 'var(--board-light-piece)',
      stroke: 'var(--board-dark-piece)',
      detail: 'var(--board-dark-piece)',
    },
    black: {
      fill: 'var(--board-dark-piece)',
      stroke: 'var(--board-light-piece)',
      detail: 'var(--board-light-piece)',
    },
  },
};

export const DEFAULT_PIECE_SET = 'classic';
export const DEFAULT_PIECE_PALETTE = 'ivory';

const CLASSIC = {
  k: `
    <path d="M22.5 6v4M20.5 8h4" fill="none" stroke="var(--piece-detail)" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M22.5 11c2.2 0 3.8 1.4 3.8 3.2 0 1.1-.6 2-1.5 2.6 2.4.7 4.2 2.8 4.2 5.4 0 1.6-.7 3-1.9 4 2.6 1.2 4.4 4 4.4 7.3v1.5H13.5V33.5c0-3.3 1.8-6.1 4.4-7.3-1.2-1-1.9-2.4-1.9-4 0-2.6 1.8-4.7 4.2-5.4-.9-.6-1.5-1.5-1.5-2.6 0-1.8 1.6-3.2 3.8-3.2z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M16 34.5h13M17.2 37.5h10.6" fill="none" stroke="var(--piece-detail)" stroke-width="1.4" stroke-linecap="round"/>
  `,
  q: `
    <circle cx="12.5" cy="12" r="1.7" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.2"/>
    <circle cx="18" cy="9.5" r="1.7" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.2"/>
    <circle cx="22.5" cy="8.5" r="1.8" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.2"/>
    <circle cx="27" cy="9.5" r="1.7" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.2"/>
    <circle cx="32.5" cy="12" r="1.7" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.2"/>
    <path d="M12.5 13.5 16 20l2.8-5.2L22.5 22l3.7-7.2L29 20l3.5-6.5v.2C31 22 29 26.5 27.2 29.2c-1 .1-10.4.1-11.4 0C14 26.5 12 22 12.5 13.7z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M14.8 30.5c1.6 1.8 4.2 2.8 7.7 2.8s6.1-1 7.7-2.8" fill="none" stroke="var(--piece-detail)" stroke-width="1.3"/>
    <path d="M13.5 34.8h18v2.8c0 1.2-4 2.2-9 2.2s-9-1-9-2.2z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.5" stroke-linejoin="round"/>
  `,
  r: `
    <path d="M14 10.5h3.2v3.2H18.8V10.5h7.4v3.2h1.6V10.5H31V16.8l-2.2 2.2v8.2l2.2 2.2v4.1H14v-4.1l2.2-2.2v-8.2L14 16.8z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M16.5 25.5h12M16.5 20.5h12" fill="none" stroke="var(--piece-detail)" stroke-width="1.2"/>
    <path d="M13.2 34.8h18.6v2.9c0 1.1-4.1 2-9.3 2s-9.3-.9-9.3-2z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.5" stroke-linejoin="round"/>
  `,
  b: `
    <circle cx="22.5" cy="9" r="2.1" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.4"/>
    <path d="M22.5 11.8c4.8 3.2 8.2 8.2 8.2 13.4 0 3.4-1.6 5.6-4.2 7.1H18.5c-2.6-1.5-4.2-3.7-4.2-7.1 0-5.2 3.4-10.2 8.2-13.4z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M20.2 20.5 24.8 26M24.8 20.5 20.2 26" fill="none" stroke="var(--piece-detail)" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M16.8 33.8h11.4c1.4.6 2.3 1.5 2.3 2.6 0 1.3-3.1 2.3-5.7 2.3h-4.6c-2.6 0-5.7-1-5.7-2.3 0-1.1.9-2 2.3-2.6z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.5" stroke-linejoin="round"/>
  `,
  n: (color) => `
    <g fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">
      <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/>
      <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"/>
    </g>
    <path fill="var(--piece-detail)" stroke="var(--piece-detail)" d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0m5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5"/>
    ${color === 'black' ? '<path fill="var(--piece-detail)" stroke="none" d="m24.55 10.4-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34s-5.79-6.64-9.19-7.16z"/>' : ''}
  `,
  p: `
    <path d="M22.5 11c2.5 0 4.5 2 4.5 4.5 0 1.4-.6 2.6-1.6 3.4 2.4.9 4.1 3.2 4.1 5.9 0 1.5-.5 2.8-1.4 3.9 2.3 1.1 3.9 3.5 3.9 6.3v1.5H13v-1.5c0-2.8 1.6-5.2 3.9-6.3-.9-1.1-1.4-2.4-1.4-3.9 0-2.7 1.7-5 4.1-5.9-1-.8-1.6-2-1.6-3.4C18 13 20 11 22.5 11z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.5" stroke-linejoin="round"/>
  `,
};

const MODERN = {
  k: `
    <path d="M22.5 5.5v5M20 8h5" fill="none" stroke="var(--piece-detail)" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M16 14.5h13l-1.5 4.5h-10zM15 20h15l-2 8H17zM14 29.5h17l-1.5 5.5h-14z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.4" stroke-linejoin="round"/>
  `,
  q: `
    <path d="M12 13l3.5 8h14L33 13l-4.5 3-3.5-6-2.5 6.5L20 10l-3.5 6z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M15.5 22.5h14l-1.5 7h-11zM14 31h17l-1.5 5.5h-14z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="22.5" cy="8" r="1.6" fill="var(--piece-detail)"/>
  `,
  r: `
    <path d="M15 10h4v3h7v-3h4v7H15zM15 18h15v10H15zM14 29.5h17v6.5H14z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.4" stroke-linejoin="round"/>
  `,
  b: `
    <circle cx="22.5" cy="9.5" r="2.4" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.4"/>
    <path d="M22.5 13c5 3.5 8 8.5 8 13.5 0 4-3 7-8 7s-8-3-8-7c0-5 3-10 8-13.5z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M22.5 18v10M19.5 23h6" fill="none" stroke="var(--piece-detail)" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M15 35h15v2.5H15z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.4"/>
  `,
  n: (color) => `
    <g fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">
      <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/>
      <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"/>
    </g>
    <path fill="var(--piece-detail)" stroke="var(--piece-detail)" d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0m5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5"/>
    ${color === 'black' ? '<path fill="var(--piece-detail)" stroke="none" d="m24.55 10.4-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34s-5.79-6.64-9.19-7.16z"/>' : ''}
  `,
  p: `
    <circle cx="22.5" cy="14" r="4.2" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.4"/>
    <path d="M17 20.5h11l-1.5 7h-8zM15.5 29h14l-1.5 6.5h-11z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.4" stroke-linejoin="round"/>
  `,
};

const LINE = {
  k: `
    <g fill="none" stroke="var(--piece-stroke)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">
      <path d="M22.5 6v5M20 8.5h5"/>
      <path d="M16.5 14.5h12c1 2.5 1.5 5 .8 7.5-.8 3-2.8 5-6.8 5s-6-2-6.8-5c-.7-2.5-.2-5 .8-7.5z"/>
      <path d="M15 29h15v5.5H15z"/>
    </g>
  `,
  q: `
    <g fill="none" stroke="var(--piece-stroke)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">
      <path d="M13 13l3.2 8h12.6L32 13l-4 2.5L25 9.5 22.5 16 20 9.5l-3 6z"/>
      <path d="M16.5 22.5h12l-1 7h-10z"/>
      <path d="M15 31h15v5H15z"/>
      <circle cx="22.5" cy="8" r="1.4"/>
    </g>
  `,
  r: `
    <g fill="none" stroke="var(--piece-stroke)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">
      <path d="M15.5 11h3.5v3h7v-3H29.5v6H15.5z"/>
      <path d="M16 18h13v10H16z"/>
      <path d="M14.5 29.5h16V36h-16z"/>
    </g>
  `,
  b: `
    <g fill="none" stroke="var(--piece-stroke)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">
      <circle cx="22.5" cy="10" r="2.2"/>
      <path d="M22.5 13.5c4.5 3 7.5 7.5 7.5 12.5 0 3.5-2.8 6.5-7.5 6.5s-7.5-3-7.5-6.5c0-5 3-9.5 7.5-12.5z"/>
      <path d="M22.5 18.5v9M19.5 23h6"/>
      <path d="M16 35h13"/>
    </g>
  `,
  n: `
    <g fill="none" stroke="var(--piece-stroke)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
      <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/>
      <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"/>
      <path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0m5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5" fill="var(--piece-stroke)" stroke="none"/>
    </g>
  `,
  p: `
    <g fill="none" stroke="var(--piece-stroke)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">
      <circle cx="22.5" cy="14.5" r="4"/>
      <path d="M17.5 20.5h10l-1.2 7H18.7z"/>
      <path d="M16 29.5h13l-1.2 5.5H17.2z"/>
    </g>
  `,
};

const BLOCKS = {
  k: `
    <path d="M20.5 6h4v3h-4zM16 11h13v5H16zM15 18h15v10H15zM14 30h17v7H14z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M22.5 6.5v8M20.5 8.5h4" fill="none" stroke="var(--piece-detail)" stroke-width="1.5" stroke-linecap="round"/>
  `,
  q: `
    <path d="M13 10h3v4h-3zM19 7h3v7h-3zM26 7h3v7h-3zM32 10h3v4h-3zM15 16h15v9H15zM14 27h17v10H14z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.3" stroke-linejoin="round"/>
  `,
  r: `
    <path d="M14 9h4v4h-4zM20.5 9h4v4h-4zM27 9h4v4h-4zM14 14h17v6H14zM15 22h15v8H15zM14 32h17v5H14z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.3" stroke-linejoin="round"/>
  `,
  b: `
    <path d="M20.5 8h4v4h-4zM17 14h11v14H17zM15 30h15v7H15z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M22.5 17v8M19.5 21h6" fill="none" stroke="var(--piece-detail)" stroke-width="1.5" stroke-linecap="round"/>
  `,
  n: `
    <path d="M14 32h17v5H14zM16 26h13v6H16z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M28 26V16l-3-5-3 3-6 4v4l4 2 4-3 4 1z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.3" stroke-linejoin="round"/>
    <circle cx="18" cy="16.5" r="1.1" fill="var(--piece-detail)"/>
  `,
  p: `
    <path d="M19 11h7v7h-7zM17 20h11v8H17zM15 30h15v7H15z" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.3" stroke-linejoin="round"/>
  `,
};

const FLAT = {
  k: `
    <path d="M22.5 6v4M20.5 8h4" fill="none" stroke="var(--piece-detail)" stroke-width="2" stroke-linecap="round"/>
    <path d="M22.5 11c2.2 0 3.8 1.4 3.8 3.2 0 1.1-.6 2-1.5 2.6 2.4.7 4.2 2.8 4.2 5.4 0 1.6-.7 3-1.9 4 2.6 1.2 4.4 4 4.4 7.3v1.5H13.5V33.5c0-3.3 1.8-6.1 4.4-7.3-1.2-1-1.9-2.4-1.9-4 0-2.6 1.8-4.7 4.2-5.4-.9-.6-1.5-1.5-1.5-2.6 0-1.8 1.6-3.2 3.8-3.2z" fill="var(--piece-fill)"/>
    <path d="M14 36.5h17v2.5H14z" fill="var(--piece-fill)"/>
  `,
  q: `
    <circle cx="12.5" cy="12" r="1.8" fill="var(--piece-fill)"/>
    <circle cx="18" cy="9.5" r="1.8" fill="var(--piece-fill)"/>
    <circle cx="22.5" cy="8.5" r="1.9" fill="var(--piece-fill)"/>
    <circle cx="27" cy="9.5" r="1.8" fill="var(--piece-fill)"/>
    <circle cx="32.5" cy="12" r="1.8" fill="var(--piece-fill)"/>
    <path d="M12.5 13.5 16 20l2.8-5.2L22.5 22l3.7-7.2L29 20l3.5-6.5C31 22 29 26.5 27.2 29.2c-1 .1-10.4.1-11.4 0C14 26.5 12 22 12.5 13.7z" fill="var(--piece-fill)"/>
    <path d="M13.5 34.8h18v3.2H13.5z" fill="var(--piece-fill)"/>
  `,
  r: `
    <path d="M14 10.5h3.2v3.2H18.8V10.5h7.4v3.2h1.6V10.5H31V16.8l-2.2 2.2v8.2l2.2 2.2v4.1H14v-4.1l2.2-2.2v-8.2L14 16.8z" fill="var(--piece-fill)"/>
    <path d="M13.2 34.8h18.6v3.2H13.2z" fill="var(--piece-fill)"/>
  `,
  b: `
    <circle cx="22.5" cy="9" r="2.3" fill="var(--piece-fill)"/>
    <path d="M22.5 11.8c4.8 3.2 8.2 8.2 8.2 13.4 0 3.4-1.6 5.6-4.2 7.1H18.5c-2.6-1.5-4.2-3.7-4.2-7.1 0-5.2 3.4-10.2 8.2-13.4z" fill="var(--piece-fill)"/>
    <path d="M20.2 20.5 24.8 26M24.8 20.5 20.2 26" fill="none" stroke="var(--piece-detail)" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M16 34.5h13v3H16z" fill="var(--piece-fill)"/>
  `,
  n: (color) => `
    <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="var(--piece-fill)"/>
    <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="var(--piece-fill)"/>
    <path fill="var(--piece-detail)" d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0m5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5"/>
    ${color === 'black' ? '<path fill="var(--piece-detail)" d="m24.55 10.4-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34s-5.79-6.64-9.19-7.16z"/>' : ''}
  `,
  p: `
    <path d="M22.5 11c2.5 0 4.5 2 4.5 4.5 0 1.4-.6 2.6-1.6 3.4 2.4.9 4.1 3.2 4.1 5.9 0 1.5-.5 2.8-1.4 3.9 2.3 1.1 3.9 3.5 3.9 6.3v1.5H13v-1.5c0-2.8 1.6-5.2 3.9-6.3-.9-1.1-1.4-2.4-1.4-3.9 0-2.7 1.7-5 4.1-5.9-1-.8-1.6-2-1.6-3.4C18 13 20 11 22.5 11z" fill="var(--piece-fill)"/>
  `,
};

const SET_PATHS = {
  classic: CLASSIC,
  modern: MODERN,
  blocks: BLOCKS,
  flat: FLAT,
  line: LINE,
};

export function resolvePieceSet(setId) {
  return PIECE_SETS[setId] ? setId : DEFAULT_PIECE_SET;
}

export function resolvePiecePalette(paletteId) {
  return PIECE_PALETTES[paletteId] ? paletteId : DEFAULT_PIECE_PALETTE;
}

export function getPaletteSide(paletteId, color) {
  const palette = PIECE_PALETTES[resolvePiecePalette(paletteId)];
  return palette[color === 'black' ? 'black' : 'white'];
}

export function getPaletteSideNames(paletteId) {
  const palette = PIECE_PALETTES[resolvePiecePalette(paletteId)];
  return {
    white: palette.whiteName || 'White',
    black: palette.blackName || 'Black',
  };
}

export function applyPiecePalette(paletteId, root = document.documentElement) {
  const palette = PIECE_PALETTES[resolvePiecePalette(paletteId)];
  const { white, black } = palette;
  root.style.setProperty('--piece-white-fill', white.fill);
  root.style.setProperty('--piece-white-stroke', white.stroke);
  root.style.setProperty('--piece-white-detail', white.detail);
  root.style.setProperty('--piece-black-fill', black.fill);
  root.style.setProperty('--piece-black-stroke', black.stroke);
  root.style.setProperty('--piece-black-detail', black.detail);
}

/**
 * @param {'k'|'q'|'r'|'b'|'n'|'p'} type
 * @param {'white'|'black'} color
 * @param {string} [setId]
 * @param {string} [paletteId]
 */
export function renderPieceSvg(type, color, setId = DEFAULT_PIECE_SET, paletteId = DEFAULT_PIECE_PALETTE) {
  const set = resolvePieceSet(setId);
  const entry = SET_PATHS[set][type];
  const paths = typeof entry === 'function' ? entry(color) : entry;
  if (!paths) {
    return '';
  }

  const side = getPaletteSide(paletteId, color);
  const colored = paths
    .replaceAll('var(--piece-fill)', side.fill)
    .replaceAll('var(--piece-stroke)', side.stroke)
    .replaceAll('var(--piece-detail)', side.detail);

  return `
    <svg class="piece-svg" viewBox="0 0 45 45" data-piece="${type}" data-color="${color}" role="presentation" focusable="false" aria-hidden="true">
      ${colored}
    </svg>
  `.trim();
}
