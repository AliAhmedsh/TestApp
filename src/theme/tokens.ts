import { Dimensions, PixelRatio, Platform } from 'react-native';

const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get('window');

export const layout = {
  windowWidth: WINDOW_WIDTH,
  windowHeight: WINDOW_HEIGHT,
  isTablet: WINDOW_WIDTH >= 600,
  maxContentWidth: Math.min(WINDOW_WIDTH - 32, 440),
  horizontalPad: 8,
  hitSlop: { top: 12, bottom: 12, left: 12, right: 12 } as const,
};

const fontScale = PixelRatio.getFontScale();

export const font = {
  /** Respect system font size without blowing up layout */
  title: Math.round(22 * Math.min(fontScale, 1.15)),
  headline: Math.round(18 * Math.min(fontScale, 1.12)),
  body: Math.round(16 * Math.min(fontScale, 1.1)),
  small: Math.round(13 * Math.min(fontScale, 1.08)),
  caption: Math.round(12 * Math.min(fontScale, 1.06)),
};

export const colors = {
  bg: '#f7fafc',
  surface: '#fff',
  surface2: '#f1f5f9',
  border: '#d1d5db',
  borderMuted: '#e5e7eb',
  text: '#1e293b',
  textMuted: '#64748b',
  textDim: '#94a3b8',
  accent: '#2563eb',
  accentMuted: '#60a5fa',
  danger: '#dc2626',
  success: '#16a34a',
  warning: '#ca8a04',
};

export const radii = { sm: 8, md: 12, lg: 16, full: 9999 };

export const keyboardOffset = Platform.OS === 'ios' ? 8 : 0;
