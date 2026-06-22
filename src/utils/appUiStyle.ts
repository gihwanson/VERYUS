import { applyAppTheme, getSavedAppTheme } from './appTheme';
import { applyBottomNavTheme, getSavedBottomNavTheme } from './bottomNavTheme';
import {
  APP_UI_STYLE_CHANGE_EVENT,
  applyAppUiStyleAttribute,
  getSavedAppUiStyle,
  type AppUiStyleId,
} from './appUiStyleStorage';

export {
  APP_UI_STYLE_CHANGE_EVENT,
  APP_UI_STYLE_STORAGE_KEY,
  getSavedAppUiStyle,
  type AppUiStyleId,
} from './appUiStyleStorage';

export interface AppUiStyleOption {
  id: AppUiStyleId;
  label: string;
  preview: string;
}

export const APP_UI_STYLE_OPTIONS: AppUiStyleOption[] = [
  {
    id: 'warm-paper',
    label: '노트북 (현재)',
    preview: 'linear-gradient(135deg, #f5f0e8 0%, #fffdf8 100%)',
  },
  {
    id: 'classic',
    label: '클래식 (이전)',
    preview: 'linear-gradient(135deg, #8E9BC8 0%, #9A8BB5 100%)',
  },
];

/** 스타일 변경 후 테마 변수·하단 네비를 다시 적용 */
export function syncThemesAfterUiStyleChange(): void {
  applyAppTheme(getSavedAppTheme());
  applyBottomNavTheme(getSavedBottomNavTheme());
}

export function setAppUiStyle(styleId: AppUiStyleId): void {
  if (getSavedAppUiStyle() === styleId) return;

  applyAppUiStyleAttribute(styleId);
  syncThemesAfterUiStyleChange();

  /* 스타일 시트·레이아웃 전환을 확실히 반영 */
  window.setTimeout(() => {
    window.location.reload();
  }, 0);
}

export function initAppUiStyle(): void {
  applyAppUiStyleAttribute(getSavedAppUiStyle());
}
