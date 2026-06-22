import { getAccentForThemeId, getSavedAppTheme, syncPaperNavAccent } from './appTheme';
import { getSavedAppUiStyle } from './appUiStyleStorage';

export const BOTTOM_NAV_THEME_STORAGE_KEY = 'veryus_bottom_nav_theme';
export const BOTTOM_NAV_THEME_CHANGE_EVENT = 'veryus-bottom-nav-theme-change';

export type BottomNavThemeId =
  | 'paper'
  | 'white'
  | 'dark'
  | 'sky'
  | 'rose'
  | 'mint'
  | 'lavender'
  | 'night';

export interface BottomNavThemeOption {
  id: BottomNavThemeId;
  label: string;
  preview: string;
}

interface BottomNavThemeVars {
  navBg: string;
  navBorder: string;
  navShadow: string;
  navItemHover: string;
  navItemActive: string;
  navText: string;
  navTextActive: string;
  navToggleBg: string;
  navToggleHover: string;
  navToggleShadow: string;
  navToggleShadowHover: string;
  navSubmenuItemBg: string;
  navSubmenuItemBorder: string;
  navSubmenuText: string;
  navSubmenuTextHover: string;
  navSubmenuIcon: string;
  navSubmenuHoverBg: string;
  navSubmenuHoverBorder: string;
  navSearchInnerBg: string;
  navSearchInnerBorder: string;
  navSearchIcon: string;
  navSearchInput: string;
  navSearchPlaceholder: string;
}

const THEMES: Record<BottomNavThemeId, BottomNavThemeVars> = {
  paper: {
    navBg: 'rgba(255, 253, 248, 0.98)',
    navBorder: '#e8dcc8',
    navShadow: 'rgba(139, 115, 85, 0.08)',
    navItemHover: 'rgba(139, 90, 43, 0.08)',
    navItemActive: 'rgba(139, 90, 43, 0.14)',
    navText: '#a89880',
    navTextActive: '#8b5a2b',
    navToggleBg: 'rgba(255, 253, 248, 0.98)',
    navToggleHover: '#f0e6d6',
    navToggleShadow: 'rgba(139, 115, 85, 0.12)',
    navToggleShadowHover: 'rgba(139, 90, 43, 0.2)',
    navSubmenuItemBg: '#fffdf8',
    navSubmenuItemBorder: '#e8dcc8',
    navSubmenuText: '#6b5344',
    navSubmenuTextHover: '#2c2416',
    navSubmenuIcon: '#8b7355',
    navSubmenuHoverBg: '#f0e6d6',
    navSubmenuHoverBorder: 'rgba(139, 90, 43, 0.25)',
    navSearchInnerBg: '#f5f0e8',
    navSearchInnerBorder: '#e8dcc8',
    navSearchIcon: '#8b7355',
    navSearchInput: '#2c2416',
    navSearchPlaceholder: '#a89880',
  },
  white: {
    navBg: 'rgba(255, 255, 255, 0.98)',
    navBorder: 'rgba(0, 0, 0, 0.08)',
    navShadow: 'rgba(0, 0, 0, 0.08)',
    navItemHover: 'rgba(196, 30, 58, 0.08)',
    navItemActive: 'rgba(196, 30, 58, 0.12)',
    navText: '#6B7280',
    navTextActive: '#C41E3A',
    navToggleBg: 'rgba(255, 255, 255, 0.98)',
    navToggleHover: '#F9FAFB',
    navToggleShadow: 'rgba(0, 0, 0, 0.12)',
    navToggleShadowHover: 'rgba(196, 30, 58, 0.2)',
    navSubmenuItemBg: '#F3F4F6',
    navSubmenuItemBorder: 'rgba(0, 0, 0, 0.08)',
    navSubmenuText: '#374151',
    navSubmenuTextHover: '#1F2937',
    navSubmenuIcon: '#4B5563',
    navSubmenuHoverBg: '#E5E7EB',
    navSubmenuHoverBorder: 'rgba(196, 30, 58, 0.25)',
    navSearchInnerBg: '#F3F4F6',
    navSearchInnerBorder: 'rgba(0, 0, 0, 0.1)',
    navSearchIcon: '#6B7280',
    navSearchInput: '#1F2937',
    navSearchPlaceholder: '#9CA3AF',
  },
  dark: {
    navBg: 'rgba(30, 30, 40, 0.95)',
    navBorder: 'rgba(255, 255, 255, 0.1)',
    navShadow: 'rgba(0, 0, 0, 0.3)',
    navItemHover: 'rgba(196, 30, 58, 0.2)',
    navItemActive: 'rgba(196, 30, 58, 0.3)',
    navText: 'rgba(255, 255, 255, 0.7)',
    navTextActive: '#ffffff',
    navToggleBg: 'rgba(30, 30, 40, 0.95)',
    navToggleHover: 'rgba(40, 40, 50, 0.95)',
    navToggleShadow: 'rgba(196, 30, 58, 0.3)',
    navToggleShadowHover: 'rgba(196, 30, 58, 0.4)',
    navSubmenuItemBg: 'rgba(255, 255, 255, 0.1)',
    navSubmenuItemBorder: 'rgba(255, 255, 255, 0.2)',
    navSubmenuText: 'rgba(255, 255, 255, 0.85)',
    navSubmenuTextHover: '#ffffff',
    navSubmenuIcon: '#ffffff',
    navSubmenuHoverBg: 'rgba(255, 255, 255, 0.2)',
    navSubmenuHoverBorder: 'rgba(255, 255, 255, 0.4)',
    navSearchInnerBg: 'rgba(255, 255, 255, 0.18)',
    navSearchInnerBorder: 'rgba(255, 255, 255, 0.35)',
    navSearchIcon: 'rgba(255, 255, 255, 0.9)',
    navSearchInput: '#ffffff',
    navSearchPlaceholder: 'rgba(255, 255, 255, 0.72)',
  },
  sky: {
    navBg: 'rgba(232, 244, 248, 0.98)',
    navBorder: 'rgba(59, 130, 246, 0.15)',
    navShadow: 'rgba(59, 130, 246, 0.1)',
    navItemHover: 'rgba(59, 130, 246, 0.12)',
    navItemActive: 'rgba(59, 130, 246, 0.2)',
    navText: '#475569',
    navTextActive: '#2563EB',
    navToggleBg: 'rgba(232, 244, 248, 0.98)',
    navToggleHover: '#D1E7F0',
    navToggleShadow: 'rgba(59, 130, 246, 0.15)',
    navToggleShadowHover: 'rgba(59, 130, 246, 0.25)',
    navSubmenuItemBg: 'rgba(255, 255, 255, 0.75)',
    navSubmenuItemBorder: 'rgba(59, 130, 246, 0.15)',
    navSubmenuText: '#334155',
    navSubmenuTextHover: '#1E293B',
    navSubmenuIcon: '#475569',
    navSubmenuHoverBg: 'rgba(255, 255, 255, 0.95)',
    navSubmenuHoverBorder: 'rgba(59, 130, 246, 0.3)',
    navSearchInnerBg: 'rgba(255, 255, 255, 0.8)',
    navSearchInnerBorder: 'rgba(59, 130, 246, 0.2)',
    navSearchIcon: '#64748B',
    navSearchInput: '#1E293B',
    navSearchPlaceholder: '#94A3B8',
  },
  rose: {
    navBg: 'rgba(255, 241, 242, 0.98)',
    navBorder: 'rgba(196, 30, 58, 0.15)',
    navShadow: 'rgba(196, 30, 58, 0.1)',
    navItemHover: 'rgba(196, 30, 58, 0.1)',
    navItemActive: 'rgba(196, 30, 58, 0.18)',
    navText: '#78716C',
    navTextActive: '#C41E3A',
    navToggleBg: 'rgba(255, 241, 242, 0.98)',
    navToggleHover: '#FFE4E6',
    navToggleShadow: 'rgba(196, 30, 58, 0.15)',
    navToggleShadowHover: 'rgba(196, 30, 58, 0.25)',
    navSubmenuItemBg: 'rgba(255, 255, 255, 0.85)',
    navSubmenuItemBorder: 'rgba(196, 30, 58, 0.12)',
    navSubmenuText: '#44403C',
    navSubmenuTextHover: '#292524',
    navSubmenuIcon: '#57534E',
    navSubmenuHoverBg: '#FFF1F2',
    navSubmenuHoverBorder: 'rgba(196, 30, 58, 0.3)',
    navSearchInnerBg: 'rgba(255, 255, 255, 0.9)',
    navSearchInnerBorder: 'rgba(196, 30, 58, 0.15)',
    navSearchIcon: '#78716C',
    navSearchInput: '#292524',
    navSearchPlaceholder: '#A8A29E',
  },
  mint: {
    navBg: 'rgba(236, 253, 245, 0.98)',
    navBorder: 'rgba(34, 139, 34, 0.15)',
    navShadow: 'rgba(34, 139, 34, 0.1)',
    navItemHover: 'rgba(34, 139, 34, 0.1)',
    navItemActive: 'rgba(34, 139, 34, 0.18)',
    navText: '#4B5563',
    navTextActive: '#228B22',
    navToggleBg: 'rgba(236, 253, 245, 0.98)',
    navToggleHover: '#D1FAE5',
    navToggleShadow: 'rgba(34, 139, 34, 0.15)',
    navToggleShadowHover: 'rgba(34, 139, 34, 0.25)',
    navSubmenuItemBg: 'rgba(255, 255, 255, 0.85)',
    navSubmenuItemBorder: 'rgba(34, 139, 34, 0.12)',
    navSubmenuText: '#374151',
    navSubmenuTextHover: '#14532D',
    navSubmenuIcon: '#4B5563',
    navSubmenuHoverBg: '#ECFDF5',
    navSubmenuHoverBorder: 'rgba(34, 139, 34, 0.3)',
    navSearchInnerBg: 'rgba(255, 255, 255, 0.9)',
    navSearchInnerBorder: 'rgba(34, 139, 34, 0.15)',
    navSearchIcon: '#6B7280',
    navSearchInput: '#14532D',
    navSearchPlaceholder: '#9CA3AF',
  },
  lavender: {
    navBg: 'rgba(245, 243, 255, 0.98)',
    navBorder: 'rgba(139, 92, 246, 0.15)',
    navShadow: 'rgba(139, 92, 246, 0.1)',
    navItemHover: 'rgba(139, 92, 246, 0.1)',
    navItemActive: 'rgba(139, 92, 246, 0.18)',
    navText: '#6B7280',
    navTextActive: '#7C3AED',
    navToggleBg: 'rgba(245, 243, 255, 0.98)',
    navToggleHover: '#EDE9FE',
    navToggleShadow: 'rgba(139, 92, 246, 0.15)',
    navToggleShadowHover: 'rgba(139, 92, 246, 0.25)',
    navSubmenuItemBg: 'rgba(255, 255, 255, 0.85)',
    navSubmenuItemBorder: 'rgba(139, 92, 246, 0.12)',
    navSubmenuText: '#374151',
    navSubmenuTextHover: '#4C1D95',
    navSubmenuIcon: '#6B7280',
    navSubmenuHoverBg: '#F5F3FF',
    navSubmenuHoverBorder: 'rgba(139, 92, 246, 0.3)',
    navSearchInnerBg: 'rgba(255, 255, 255, 0.9)',
    navSearchInnerBorder: 'rgba(139, 92, 246, 0.15)',
    navSearchIcon: '#6B7280',
    navSearchInput: '#4C1D95',
    navSearchPlaceholder: '#9CA3AF',
  },
  night: {
    navBg: 'rgba(15, 23, 42, 0.96)',
    navBorder: 'rgba(148, 163, 184, 0.2)',
    navShadow: 'rgba(0, 0, 0, 0.35)',
    navItemHover: 'rgba(99, 102, 241, 0.25)',
    navItemActive: 'rgba(99, 102, 241, 0.35)',
    navText: 'rgba(226, 232, 240, 0.75)',
    navTextActive: '#A5B4FC',
    navToggleBg: 'rgba(15, 23, 42, 0.96)',
    navToggleHover: 'rgba(30, 41, 59, 0.96)',
    navToggleShadow: 'rgba(99, 102, 241, 0.3)',
    navToggleShadowHover: 'rgba(99, 102, 241, 0.45)',
    navSubmenuItemBg: 'rgba(255, 255, 255, 0.08)',
    navSubmenuItemBorder: 'rgba(148, 163, 184, 0.25)',
    navSubmenuText: 'rgba(226, 232, 240, 0.9)',
    navSubmenuTextHover: '#F8FAFC',
    navSubmenuIcon: '#E2E8F0',
    navSubmenuHoverBg: 'rgba(255, 255, 255, 0.14)',
    navSubmenuHoverBorder: 'rgba(148, 163, 184, 0.4)',
    navSearchInnerBg: 'rgba(255, 255, 255, 0.1)',
    navSearchInnerBorder: 'rgba(148, 163, 184, 0.3)',
    navSearchIcon: 'rgba(226, 232, 240, 0.9)',
    navSearchInput: '#F8FAFC',
    navSearchPlaceholder: 'rgba(226, 232, 240, 0.55)',
  },
};

export const BOTTOM_NAV_THEME_OPTIONS: BottomNavThemeOption[] = [
  { id: 'paper', label: '웜 페이퍼', preview: '#fffdf8' },
  { id: 'white', label: '흰색', preview: '#FFFFFF' },
  { id: 'dark', label: '다크', preview: '#1E1E28' },
  { id: 'sky', label: '하늘', preview: '#E8F4F8' },
  { id: 'rose', label: '로즈', preview: '#FFF1F2' },
  { id: 'mint', label: '민트', preview: '#ECFDF5' },
  { id: 'lavender', label: '라벤더', preview: '#F5F3FF' },
  { id: 'night', label: '나이트', preview: '#0F172A' },
];

const CSS_VAR_MAP: Array<[keyof BottomNavThemeVars, string]> = [
  ['navBg', '--nav-bg'],
  ['navBorder', '--nav-border'],
  ['navShadow', '--nav-shadow'],
  ['navItemHover', '--nav-item-hover'],
  ['navItemActive', '--nav-item-active'],
  ['navText', '--nav-text'],
  ['navTextActive', '--nav-text-active'],
  ['navToggleBg', '--nav-toggle-bg'],
  ['navToggleHover', '--nav-toggle-hover'],
  ['navToggleShadow', '--nav-toggle-shadow'],
  ['navToggleShadowHover', '--nav-toggle-shadow-hover'],
  ['navSubmenuItemBg', '--nav-submenu-item-bg'],
  ['navSubmenuItemBorder', '--nav-submenu-item-border'],
  ['navSubmenuText', '--nav-submenu-text'],
  ['navSubmenuTextHover', '--nav-submenu-text-hover'],
  ['navSubmenuIcon', '--nav-submenu-icon'],
  ['navSubmenuHoverBg', '--nav-submenu-hover-bg'],
  ['navSubmenuHoverBorder', '--nav-submenu-hover-border'],
  ['navSearchInnerBg', '--nav-search-inner-bg'],
  ['navSearchInnerBorder', '--nav-search-inner-border'],
  ['navSearchIcon', '--nav-search-icon'],
  ['navSearchInput', '--nav-search-input'],
  ['navSearchPlaceholder', '--nav-search-placeholder'],
];

export function isBottomNavThemeId(value: string): value is BottomNavThemeId {
  return value in THEMES;
}

export function getSavedBottomNavTheme(): BottomNavThemeId {
  try {
    const saved = localStorage.getItem(BOTTOM_NAV_THEME_STORAGE_KEY);
    if (saved && isBottomNavThemeId(saved)) return saved;
  } catch {
    /* ignore */
  }
  return getSavedAppUiStyle() === 'classic' ? 'white' : 'paper';
}

/** 클래식 UI에서는 paper(노트북) 네비 팔레트를 white로 대체 */
export function resolveBottomNavThemeForApply(themeId: BottomNavThemeId): BottomNavThemeId {
  if (getSavedAppUiStyle() === 'classic' && themeId === 'paper') {
    return 'white';
  }
  return themeId;
}

export function applyBottomNavTheme(themeId: BottomNavThemeId): void {
  const effectiveThemeId = resolveBottomNavThemeForApply(themeId);
  const theme = THEMES[effectiveThemeId] ?? THEMES.white;
  const root = document.documentElement;

  for (const [key, cssVar] of CSS_VAR_MAP) {
    root.style.setProperty(cssVar, theme[key]);
  }

  if (themeId === 'paper' && getSavedAppUiStyle() === 'warm-paper') {
    syncPaperNavAccent(root, getAccentForThemeId(getSavedAppTheme()));
  }

  root.setAttribute('data-bottom-nav-theme', themeId);
  localStorage.setItem(BOTTOM_NAV_THEME_STORAGE_KEY, themeId);
  window.dispatchEvent(new Event(BOTTOM_NAV_THEME_CHANGE_EVENT));
}
