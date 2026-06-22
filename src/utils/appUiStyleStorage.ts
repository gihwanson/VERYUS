export const APP_UI_STYLE_STORAGE_KEY = 'veryus_app_ui_style';
export const APP_UI_STYLE_CHANGE_EVENT = 'veryus-app-ui-style-change';

export type AppUiStyleId = 'warm-paper' | 'classic';

export function isAppUiStyleId(value: string): value is AppUiStyleId {
  return value === 'warm-paper' || value === 'classic';
}

export function getSavedAppUiStyle(): AppUiStyleId {
  try {
    const saved = localStorage.getItem(APP_UI_STYLE_STORAGE_KEY);
    if (saved && isAppUiStyleId(saved)) return saved;
  } catch {
    /* ignore */
  }
  return 'warm-paper';
}

export function applyAppUiStyleAttribute(styleId: AppUiStyleId): void {
  document.documentElement.setAttribute('data-ui-style', styleId);
  localStorage.setItem(APP_UI_STYLE_STORAGE_KEY, styleId);
  window.dispatchEvent(new Event(APP_UI_STYLE_CHANGE_EVENT));
}
