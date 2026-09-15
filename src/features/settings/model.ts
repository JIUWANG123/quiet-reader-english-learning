import type { ReaderSettings } from '../../types';
import { clamp } from '../../services/books/text';
export const defaults: ReaderSettings = { theme: 'paper', fontSize: 21, lineHeight: 1.7, margin: 26, readingMode: 'swipe', pageAnimation: true, volumePageTurn: false, paragraphTranslation: false };
export function parseSettings(raw?: string): ReaderSettings {
  try {
    const value = JSON.parse(raw ?? '{}');
    return {
      readingMode: ['swipe','tap','scroll'].includes(value.readingMode) ? value.readingMode : defaults.readingMode,
      volumePageTurn: value.volumePageTurn===true,
      paragraphTranslation: value.paragraphTranslation===true,
      pageAnimation: typeof value.pageAnimation === 'boolean' ? value.pageAnimation : defaults.pageAnimation,
      theme: ['white', 'paper', 'dark'].includes(value.theme) ? value.theme : defaults.theme,
      fontSize: typeof value.fontSize === 'number' ? clamp(value.fontSize, 16, 32) : defaults.fontSize,
      lineHeight: typeof value.lineHeight === 'number' ? clamp(value.lineHeight, 1.3, 2.2) : defaults.lineHeight,
      margin: typeof value.margin === 'number' ? clamp(value.margin, 12, 40) : defaults.margin,
    };
  } catch { return defaults; }
}
export const palettes = {
  white: { background: '#FFFFFF', surface: '#F3F5F3', text: '#252E29', muted: '#657168', accent: '#38634C', border: '#E0E6E1' },
  paper: { background: '#FAF7EF', surface: '#F0EBDD', text: '#30382F', muted: '#737B6D', accent: '#506747', border: '#E4DFD2' },
  dark: { background: '#191E1C', surface: '#252D28', text: '#E4E8DF', muted: '#A1ACA3', accent: '#B0CCB2', border: '#384139' },
};
