export const APP_UI_STYLE_STORAGE_KEY = 'veryus_app_ui_style';
export const APP_UI_STYLE_CHANGE_EVENT = 'veryus-app-ui-style-change';

export type AppUiStyleId = 'warm-paper' | 'classic';

export function isAppUiStyleId(value: string): value is AppUiStyleId {
  return value === 'warm-paper' || value === 'classic';
}

export function getSavedAppUiStyle(): AppUiStyleId {
  try {
    const saved = localStorage.getItem(APP_UI_STYLE_STORAGE_KEY);
    if (saved === 'classic') {
      localStorage.setItem(APP_UI_STYLE_STORAGE_KEY, 'warm-paper');
      return 'warm-paper';
    }
    if (saved && isAppUiStyleId(saved)) return saved;
  } catch {
    /* ignore */
  }
  return 'warm-paper';
}

export function applyAppUiStyleAttribute(styleId: AppUiStyleId): void {
  const resolvedStyleId: AppUiStyleId = styleId === 'classic' ? 'warm-paper' : styleId;
  document.documentElement.setAttribute('data-ui-style', resolvedStyleId);
  localStorage.setItem(APP_UI_STYLE_STORAGE_KEY, resolvedStyleId);
  window.dispatchEvent(new Event(APP_UI_STYLE_CHANGE_EVENT));
}
