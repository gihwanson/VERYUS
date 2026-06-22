/**
 * UI 스타일별 CSS 번들 — 한 번에 하나만 로드
 */
import { getSavedAppUiStyle, type AppUiStyleId } from './appUiStyleStorage';

let loadedStyle: AppUiStyleId | null = null;

export async function loadUiStyleCss(style: AppUiStyleId = getSavedAppUiStyle()): Promise<void> {
  if (loadedStyle === style) return;

  if (style === 'warm-paper') {
    await import('../styles/ui-style-warm-paper.css');
  } else {
    await import('../styles/ui-style-classic.css');
  }

  loadedStyle = style;
}
