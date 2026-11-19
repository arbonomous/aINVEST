export type ThemeId = 'slate' | 'daylight';

export interface ThemePalette {
  id: ThemeId;
  label: string;
  description: string;
  swatchBg: string;
  swatchAccent: string;
  tvTheme: 'dark' | 'light';
  chartBg: string;
  chartText: string;
  chartGrid: string;
  crosshair: string;
  crosshairLabel: string;
  border: string;
  bull: string;
  bear: string;
  amber: string;
  ema9: string;
  ema21: string;
  volUp: string;
  volDown: string;
  needle: string;
  muted: string;
  themeColorMeta: string;
}

export const THEMES: ThemePalette[] = [
  {
    id: 'slate',
    label: 'Slate',
    description: 'Charcoal slate dark with crisp borders & bright chart lines',
    swatchBg: '#161A24',
    swatchAccent: '#3AD69F',
    tvTheme: 'dark',
    chartBg: '#0E1015',
    chartText: '#B4BECE',
    chartGrid: 'rgba(74, 86, 112, 0.52)',
    crosshair: 'rgba(235, 240, 248, 0.42)',
    crosshairLabel: '#3A4356',
    border: '#3A4356',
    bull: '#3AD69F',
    bear: '#F2727D',
    amber: '#F5BE58',
    ema9: '#5CE2B4',
    ema21: '#78B7FF',
    volUp: 'rgba(58, 214, 159, 0.42)',
    volDown: 'rgba(242, 114, 125, 0.42)',
    needle: '#EEF2F8',
    muted: '#8B96AA',
    themeColorMeta: '#0E1015',
  },
  {
    id: 'daylight',
    label: 'Daylight',
    description: 'Crisp warm-paper light mode',
    swatchBg: '#F4F5F7',
    swatchAccent: '#0D9468',
    tvTheme: 'light',
    chartBg: '#FFFFFF',
    chartText: '#525B6C',
    chartGrid: 'rgba(209, 215, 226, 0.65)',
    crosshair: 'rgba(20, 24, 33, 0.28)',
    crosshairLabel: '#1E2430',
    border: '#DCE1EA',
    bull: '#0D9468',
    bear: '#C93B48',
    amber: '#B87A14',
    ema9: '#0D9468',
    ema21: '#2563EB',
    volUp: 'rgba(13, 148, 104, 0.24)',
    volDown: 'rgba(201, 59, 72, 0.24)',
    needle: '#181E29',
    muted: '#6B7485',
    themeColorMeta: '#F4F5F7',
  },
];

export const THEME_MAP: Record<ThemeId, ThemePalette> = {
  slate: THEMES[0],
  daylight: THEMES[1],
};

const THEME_STORAGE_KEY = 'ainvest_theme_v1';

export function getInitialTheme(): ThemeId {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'slate' || saved === 'daylight') {
      return saved;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'slate';
}

export function applyTheme(id: ThemeId): void {
  document.documentElement.setAttribute('data-theme', id);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', THEME_MAP[id].themeColorMeta);
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Ignore
  }
}
