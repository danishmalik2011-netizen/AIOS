export const COLORS = {
  cream: '#F7F3EC',
  creamDark: '#EFE9DF',
  ink: '#1A160F',
  inkSoft: '#3D372E',
  orange: '#C05A1E',
  orangeBright: '#E06A22',
  paperLine: '#E2DACC',
  darkBg: '#211E19',
  darkPanel: '#2B2822',
  darkLine: '#3A362E',
  fadedText: '#8B8375',
  green: '#4C7A4C',
  red: '#B0402E',
} as const

export const FONTS = {
  sans: 'var(--font-archivo), system-ui, sans-serif',
  mono: 'var(--font-jetbrains), ui-monospace, monospace',
} as const

export const FPS = 30
export const WIDTH = 1920
export const HEIGHT = 1080

// Scene durations in frames
export const SCENES = {
  intro: 100,
  problem: 195,
  reveal: 145,
  features: 320,
  workflow: 220,
  cta: 190,
} as const

export const TOTAL_DURATION =
  SCENES.intro +
  SCENES.problem +
  SCENES.reveal +
  SCENES.features +
  SCENES.workflow +
  SCENES.cta
