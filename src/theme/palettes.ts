// Paletas de acento predefinidas (Epic #43, issue 5/5) — curadas a mano en
// vez de un color picker libre con generación automática de tonos, para
// evitar el riesgo de una paleta fea o con mal contraste (decisión tomada
// en el issue). Las 7 paletas son las escalas de color por default de
// Tailwind CSS (ya diseñadas para tener buen contraste entre tonos) — no
// se inventó ningún hex nuevo.
export const BRAND_TONES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const
export type BrandTone = (typeof BRAND_TONES)[number]
export type BrandTones = Record<BrandTone, string>

export interface Palette {
  id: string
  name: string
  tones: BrandTones
}

// 'green' es la paleta actual de la app (tailwind.config.js tenía estos
// mismos hex hardcodeados) — tiene que ser el default para que nadie vea
// un cambio visual hasta que un super-admin elija otra paleta.
export const DEFAULT_PALETTE_ID = 'green'

export const PALETTES: Palette[] = [
  {
    id: 'green',
    name: 'Verde (default)',
    tones: {
      50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80',
      500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d',
    },
  },
  {
    id: 'blue',
    name: 'Azul',
    tones: {
      50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa',
      500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a',
    },
  },
  {
    id: 'red',
    name: 'Rojo',
    tones: {
      50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171',
      500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d',
    },
  },
  {
    id: 'purple',
    name: 'Morado',
    tones: {
      50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc',
      500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8', 900: '#581c87',
    },
  },
  {
    id: 'orange',
    name: 'Naranja',
    tones: {
      50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c',
      500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412', 900: '#7c2d12',
    },
  },
  {
    id: 'teal',
    name: 'Verde azulado',
    tones: {
      50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf',
      500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a',
    },
  },
  {
    id: 'pink',
    name: 'Rosa',
    tones: {
      50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6',
      500: '#ec4899', 600: '#db2777', 700: '#be185d', 800: '#9d174d', 900: '#831843',
    },
  },
]

export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}
