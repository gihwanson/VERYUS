/**
 * UI 스타일별 CSS 번들 — 한 번에 하나만 로드
 */
import { getSavedAppUiStyle, type AppUiStyleId } from './appUiStyleStorage';

let loadedStyle: AppUiStyleId | null = null;

export async function loadUiStyleCss(style: AppUiStyleId = getSavedAppUiStyle()): Promise<void> {
  // warm-paper 번들(끝의 배지 스킨 오버라이드 포함)을 항상 최신으로 로드
  if (loadedStyle !== style) {
    await import('../styles/ui-style-warm-paper.css');
    loadedStyle = style;
  }
}
