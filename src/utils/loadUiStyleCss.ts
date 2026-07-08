/**
 * UI 스타일별 CSS 번들 — 한 번에 하나만 로드
 */
import { getSavedAppUiStyle, type AppUiStyleId } from './appUiStyleStorage';

let loadedStyle: AppUiStyleId | null = null;

export async function loadUiStyleCss(style: AppUiStyleId = getSavedAppUiStyle()): Promise<void> {
  if (loadedStyle === style) return;

  await import('../styles/ui-style-warm-paper.css');

  loadedStyle = style;
}
