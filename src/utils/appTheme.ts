import { getSavedAppUiStyle, type AppUiStyleId } from './appUiStyleStorage';

export const APP_THEME_STORAGE_KEY = 'veryus_app_theme';
export const APP_THEME_CHANGE_EVENT = 'veryus-app-theme-change';

export type AppThemeId =
  | 'paper'
  | 'purple'
  | 'sky'
  | 'rose'
  | 'mint'
  | 'sunset'
  | 'lavender'
  | 'night';

export interface AppThemeOption {
  id: AppThemeId;
  label: string;
  preview: string;
}

interface AppThemeVars {
  gradientPrimary: string;
  homeGradient: string;
  appPageGradient: string;
  primaryBg: string;
  bgGradient: string;
  primaryColor: string;
  primaryDark: string;
  primaryLight: string;
  primaryAlpha10: string;
  primaryAlpha20: string;
  primaryAlpha30: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  pageText: string;
  pageTextMuted: string;
  cardText: string;
  cardTextMuted: string;
  glassText: string;
}

const THEMES: Record<AppThemeId, AppThemeVars> = {
  paper: {
    gradientPrimary: '#f5f0e8',
    homeGradient: 'linear-gradient(180deg, #f5f0e8 0%, #ede6d8 100%)',
    appPageGradient: '#f5f0e8',
    primaryBg: '#fffdf8',
    bgGradient: '#f5f0e8',
    primaryColor: '#8b5a2b',
    primaryDark: '#6b4423',
    primaryLight: '#a07040',
    primaryAlpha10: 'rgba(139, 90, 43, 0.1)',
    primaryAlpha20: 'rgba(139, 90, 43, 0.18)',
    primaryAlpha30: 'rgba(139, 90, 43, 0.26)',
    shadowSm: '2px 3px 0 rgba(139, 115, 85, 0.06)',
    shadowMd: '0 4px 12px rgba(139, 115, 85, 0.1)',
    shadowLg: '0 8px 24px rgba(139, 115, 85, 0.14)',
    pageText: '#2c2416',
    pageTextMuted: '#8b7355',
    cardText: '#2c2416',
    cardTextMuted: '#6b5344',
    glassText: '#2c2416',
  },
  purple: {
    gradientPrimary: 'linear-gradient(135deg, #8E9BC8 0%, #9A8BB5 100%)',
    homeGradient: 'linear-gradient(160deg, #9AA5CC 0%, #9488B0 55%, #8E96C0 100%)',
    appPageGradient: 'linear-gradient(135deg, #8E9BC8 0%, #9A8BB5 100%)',
    primaryBg: 'linear-gradient(135deg, #EEF2F6 0%, #E4EAF0 50%, #D8E2EA 100%)',
    bgGradient: 'linear-gradient(135deg, #EDE8F2 0%, #E0D8EA 100%)',
    primaryColor: '#A86B78',
    primaryDark: '#8F5A66',
    primaryLight: '#C08A96',
    primaryAlpha10: 'rgba(168, 107, 120, 0.1)',
    primaryAlpha20: 'rgba(168, 107, 120, 0.18)',
    primaryAlpha30: 'rgba(168, 107, 120, 0.26)',
    shadowSm: '0 4px 6px rgba(142, 155, 200, 0.1)',
    shadowMd: '0 8px 25px rgba(142, 155, 200, 0.14)',
    shadowLg: '0 20px 40px rgba(142, 155, 200, 0.18)',
    pageText: '#ffffff',
    pageTextMuted: 'rgba(255, 255, 255, 0.88)',
    cardText: '#111827',
    cardTextMuted: '#6b7280',
    glassText: '#1a1a2e',
  },
  sky: {
    gradientPrimary: 'linear-gradient(135deg, #8CB4C8 0%, #7A9DB5 100%)',
    homeGradient: 'linear-gradient(160deg, #A0C0D0 0%, #7A9DB5 55%, #6B8FA5 100%)',
    appPageGradient: 'linear-gradient(135deg, #8CB4C8 0%, #7A9DB5 100%)',
    primaryBg: 'linear-gradient(135deg, #E8F0F4 0%, #D8E8F0 50%, #C4D8E4 100%)',
    bgGradient: 'linear-gradient(135deg, #E8F0F4 0%, #D0E0EA 100%)',
    primaryColor: '#5F8FA8',
    primaryDark: '#4E7A90',
    primaryLight: '#7AA8BE',
    primaryAlpha10: 'rgba(95, 143, 168, 0.1)',
    primaryAlpha20: 'rgba(95, 143, 168, 0.18)',
    primaryAlpha30: 'rgba(95, 143, 168, 0.26)',
    shadowSm: '0 4px 6px rgba(122, 157, 181, 0.1)',
    shadowMd: '0 8px 25px rgba(122, 157, 181, 0.14)',
    shadowLg: '0 20px 40px rgba(122, 157, 181, 0.18)',
    pageText: '#ffffff',
    pageTextMuted: 'rgba(255, 255, 255, 0.88)',
    cardText: '#0f172a',
    cardTextMuted: '#475569',
    glassText: '#0f172a',
  },
  rose: {
    gradientPrimary: 'linear-gradient(135deg, #D4A8B0 0%, #B88A98 100%)',
    homeGradient: 'linear-gradient(160deg, #DDB8BE 0%, #B88A98 55%, #A07888 100%)',
    appPageGradient: 'linear-gradient(135deg, #D4A8B0 0%, #B88A98 100%)',
    primaryBg: 'linear-gradient(135deg, #F6F0F1 0%, #F0E6E8 50%, #E6D4D8 100%)',
    bgGradient: 'linear-gradient(135deg, #F6F0F1 0%, #E6D4D8 100%)',
    primaryColor: '#B07888',
    primaryDark: '#966878',
    primaryLight: '#C898A8',
    primaryAlpha10: 'rgba(176, 120, 136, 0.1)',
    primaryAlpha20: 'rgba(176, 120, 136, 0.18)',
    primaryAlpha30: 'rgba(176, 120, 136, 0.26)',
    shadowSm: '0 4px 6px rgba(184, 138, 152, 0.1)',
    shadowMd: '0 8px 25px rgba(184, 138, 152, 0.14)',
    shadowLg: '0 20px 40px rgba(184, 138, 152, 0.18)',
    pageText: '#ffffff',
    pageTextMuted: 'rgba(255, 255, 255, 0.88)',
    cardText: '#1f2937',
    cardTextMuted: '#6b7280',
    glassText: '#1f2937',
  },
  mint: {
    gradientPrimary: 'linear-gradient(135deg, #8FC4B0 0%, #6A9E8A 100%)',
    homeGradient: 'linear-gradient(160deg, #A0D0BE 0%, #6A9E8A 55%, #5C8E7A 100%)',
    appPageGradient: 'linear-gradient(135deg, #8FC4B0 0%, #6A9E8A 100%)',
    primaryBg: 'linear-gradient(135deg, #EEF4F1 0%, #E0EDE8 50%, #C8DED4 100%)',
    bgGradient: 'linear-gradient(135deg, #EEF4F1 0%, #C8DED4 100%)',
    primaryColor: '#5A8A78',
    primaryDark: '#4A7668',
    primaryLight: '#78A898',
    primaryAlpha10: 'rgba(90, 138, 120, 0.1)',
    primaryAlpha20: 'rgba(90, 138, 120, 0.18)',
    primaryAlpha30: 'rgba(90, 138, 120, 0.26)',
    shadowSm: '0 4px 6px rgba(106, 158, 138, 0.1)',
    shadowMd: '0 8px 25px rgba(106, 158, 138, 0.14)',
    shadowLg: '0 20px 40px rgba(106, 158, 138, 0.18)',
    pageText: '#ffffff',
    pageTextMuted: 'rgba(255, 255, 255, 0.88)',
    cardText: '#1f3a30',
    cardTextMuted: '#4b5563',
    glassText: '#1f3a30',
  },
  sunset: {
    gradientPrimary: 'linear-gradient(135deg, #D4B090 0%, #B89070 100%)',
    homeGradient: 'linear-gradient(160deg, #DCC0A0 0%, #B89070 55%, #A88060 100%)',
    appPageGradient: 'linear-gradient(135deg, #D4B090 0%, #B89070 100%)',
    primaryBg: 'linear-gradient(135deg, #F6F2EE 0%, #F0E8E0 50%, #E4D8CC 100%)',
    bgGradient: 'linear-gradient(135deg, #F6F2EE 0%, #E4D8CC 100%)',
    primaryColor: '#B08868',
    primaryDark: '#967058',
    primaryLight: '#C8A888',
    primaryAlpha10: 'rgba(176, 136, 104, 0.1)',
    primaryAlpha20: 'rgba(176, 136, 104, 0.18)',
    primaryAlpha30: 'rgba(176, 136, 104, 0.26)',
    shadowSm: '0 4px 6px rgba(184, 144, 112, 0.1)',
    shadowMd: '0 8px 25px rgba(184, 144, 112, 0.14)',
    shadowLg: '0 20px 40px rgba(184, 144, 112, 0.18)',
    pageText: '#ffffff',
    pageTextMuted: 'rgba(255, 255, 255, 0.9)',
    cardText: '#1f2937',
    cardTextMuted: '#6b7280',
    glassText: '#1f2937',
  },
  lavender: {
    gradientPrimary: 'linear-gradient(135deg, #B8A8D4 0%, #9488B8 100%)',
    homeGradient: 'linear-gradient(160deg, #C4B8DC 0%, #9488B8 55%, #8878A8 100%)',
    appPageGradient: 'linear-gradient(135deg, #B8A8D4 0%, #9488B8 100%)',
    primaryBg: 'linear-gradient(135deg, #F2F0F6 0%, #EAE6F0 50%, #DCD6E8 100%)',
    bgGradient: 'linear-gradient(135deg, #F2F0F6 0%, #DCD6E8 100%)',
    primaryColor: '#8878A8',
    primaryDark: '#746898',
    primaryLight: '#A098C0',
    primaryAlpha10: 'rgba(136, 120, 168, 0.1)',
    primaryAlpha20: 'rgba(136, 120, 168, 0.18)',
    primaryAlpha30: 'rgba(136, 120, 168, 0.26)',
    shadowSm: '0 4px 6px rgba(148, 136, 184, 0.1)',
    shadowMd: '0 8px 25px rgba(148, 136, 184, 0.14)',
    shadowLg: '0 20px 40px rgba(148, 136, 184, 0.18)',
    pageText: '#ffffff',
    pageTextMuted: 'rgba(255, 255, 255, 0.88)',
    cardText: '#2a2840',
    cardTextMuted: '#4b5563',
    glassText: '#2a2840',
  },
  night: {
    gradientPrimary: 'linear-gradient(135deg, #3D4A5C 0%, #1A2332 100%)',
    homeGradient: 'linear-gradient(160deg, #4A5668 0%, #243040 55%, #1A2332 100%)',
    appPageGradient: 'linear-gradient(135deg, #3D4A5C 0%, #1A2332 100%)',
    primaryBg: 'linear-gradient(135deg, #243040 0%, #1A2332 50%, #141C28 100%)',
    bgGradient: 'linear-gradient(135deg, #243040 0%, #1A2332 100%)',
    primaryColor: '#9A9EC8',
    primaryDark: '#8488B0',
    primaryLight: '#B0B4D8',
    primaryAlpha10: 'rgba(154, 158, 200, 0.12)',
    primaryAlpha20: 'rgba(154, 158, 200, 0.2)',
    primaryAlpha30: 'rgba(154, 158, 200, 0.28)',
    shadowSm: '0 4px 6px rgba(0, 0, 0, 0.2)',
    shadowMd: '0 8px 25px rgba(0, 0, 0, 0.28)',
    shadowLg: '0 20px 40px rgba(0, 0, 0, 0.36)',
    pageText: '#f8fafc',
    pageTextMuted: 'rgba(248, 250, 252, 0.82)',
    cardText: '#0f172a',
    cardTextMuted: '#64748b',
    glassText: '#0f172a',
  },
};

export const APP_THEME_OPTIONS: AppThemeOption[] = [
  { id: 'paper', label: '브라운 (기본)', preview: 'linear-gradient(135deg, #8b5a2b, #6b4423)' },
  { id: 'purple', label: '퍼플', preview: 'linear-gradient(135deg, #A86B78, #8F5A66)' },
  { id: 'sky', label: '하늘', preview: 'linear-gradient(135deg, #5F8FA8, #4E7A90)' },
  { id: 'rose', label: '로즈', preview: 'linear-gradient(135deg, #B07888, #966878)' },
  { id: 'mint', label: '민트', preview: 'linear-gradient(135deg, #5A8A78, #4A7668)' },
  { id: 'sunset', label: '선셋', preview: 'linear-gradient(135deg, #B08868, #967058)' },
  { id: 'lavender', label: '라벤더', preview: 'linear-gradient(135deg, #8878A8, #746898)' },
  { id: 'night', label: '나이트', preview: 'linear-gradient(135deg, #9A9EC8, #8488B0)' },
];

/** 클래식 UI — 페이지 배경 그라데이션 미리보기 (paper 제외) */
export const APP_THEME_OPTIONS_CLASSIC: AppThemeOption[] = [
  { id: 'purple', label: '퍼플', preview: 'linear-gradient(135deg, #8E9BC8, #9A8BB5)' },
  { id: 'sky', label: '하늘', preview: 'linear-gradient(135deg, #8CB4C8, #7A9DB5)' },
  { id: 'rose', label: '로즈', preview: 'linear-gradient(135deg, #D4A8B0, #B88A98)' },
  { id: 'mint', label: '민트', preview: 'linear-gradient(135deg, #8FC4B0, #6A9E8A)' },
  { id: 'sunset', label: '선셋', preview: 'linear-gradient(135deg, #D4B090, #B89070)' },
  { id: 'lavender', label: '라벤더', preview: 'linear-gradient(135deg, #B8A8D4, #9488B8)' },
  { id: 'night', label: '나이트', preview: 'linear-gradient(135deg, #3D4A5C, #1A2332)' },
];

export function getAppThemeOptions(uiStyle: AppUiStyleId = getSavedAppUiStyle()): AppThemeOption[] {
  return uiStyle === 'classic' ? APP_THEME_OPTIONS_CLASSIC : APP_THEME_OPTIONS;
}

const CONTEST_BG_VARS = [
  '--contest-create-bg',
  '--contest-list-bg',
  '--contest-detail-bg',
  '--contest-participate-bg',
  '--contest-results-bg',
] as const;

export function isAppThemeId(value: string): value is AppThemeId {
  return value in THEMES;
}

const PAPER_SURFACE: AppThemeVars = THEMES.paper;

export interface AppAccentVars {
  primaryColor: string;
  primaryDark: string;
  primaryLight: string;
  primaryAlpha10: string;
  primaryAlpha20: string;
  primaryAlpha30: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
}

export function getAccentForThemeId(themeId: AppThemeId): AppAccentVars {
  const t = THEMES[themeId] ?? THEMES.paper;
  return {
    primaryColor: t.primaryColor,
    primaryDark: t.primaryDark,
    primaryLight: t.primaryLight,
    primaryAlpha10: t.primaryAlpha10,
    primaryAlpha20: t.primaryAlpha20,
    primaryAlpha30: t.primaryAlpha30,
    shadowSm: t.shadowSm,
    shadowMd: t.shadowMd,
    shadowLg: t.shadowLg,
  };
}

const BOTTOM_NAV_THEME_STORAGE_KEY = 'veryus_bottom_nav_theme';

function getSavedBottomNavThemeId(): string {
  try {
    return localStorage.getItem(BOTTOM_NAV_THEME_STORAGE_KEY) || 'paper';
  } catch {
    return 'paper';
  }
}

/** 웜 페이퍼 하단 네비 — 앱 강조색과 동기화 */
export function syncPaperNavAccent(root: HTMLElement, accent: AppAccentVars): void {
  root.style.setProperty('--nav-text-active', accent.primaryColor);
  root.style.setProperty('--nav-item-hover', accent.primaryAlpha10);
  root.style.setProperty('--nav-item-active', accent.primaryAlpha20);
  root.style.setProperty('--nav-badge-bg', accent.primaryColor);
  root.style.setProperty('--nav-badge-shadow', accent.primaryAlpha30);
  root.style.setProperty('--nav-search-bg', accent.primaryColor);
  root.style.setProperty('--nav-search-hover', accent.primaryDark);
  root.style.setProperty('--nav-admin-bg', accent.primaryDark);
  root.style.setProperty('--nav-admin-hover', accent.primaryColor);
  root.style.setProperty('--nav-submenu-hover-border', accent.primaryAlpha30);
  root.style.setProperty('--nav-toggle-shadow-hover', accent.primaryAlpha30);
}

function applyClassicCommentThemeVars(root: HTMLElement, theme: AppThemeVars): void {
  const accentGradient = `linear-gradient(135deg, ${theme.primaryLight} 0%, ${theme.primaryDark} 100%)`;

  root.style.setProperty('--comment-bg', 'rgba(255, 255, 255, 0.88)');
  root.style.setProperty('--comment-bg-hover', 'rgba(255, 255, 255, 0.96)');
  root.style.setProperty('--comment-border', theme.primaryAlpha20);
  root.style.setProperty('--comment-border-hover', theme.primaryAlpha30);
  root.style.setProperty('--comment-header-border', theme.primaryAlpha20);
  root.style.setProperty('--comment-actions-border', theme.primaryAlpha10);
  root.style.setProperty('--comment-text', theme.cardText);
  root.style.setProperty('--comment-author', theme.cardText);
  root.style.setProperty('--comment-date', theme.cardTextMuted);
  root.style.setProperty('--comment-edit-bg', 'rgba(255, 255, 255, 0.95)');
  root.style.setProperty('--comment-edit-border', theme.primaryAlpha20);
  root.style.setProperty('--comment-button-bg', 'rgba(255, 255, 255, 0.9)');
  root.style.setProperty('--comment-button-border', theme.primaryAlpha20);
  root.style.setProperty('--comment-button-text', theme.primaryDark);
  root.style.setProperty('--comment-button-hover-bg', theme.primaryAlpha10);
  root.style.setProperty('--comment-button-hover-border', theme.primaryAlpha30);
  root.style.setProperty('--comment-button-hover-text', theme.primaryColor);
  root.style.setProperty('--comment-cancel-bg', 'rgba(255, 255, 255, 0.75)');
  root.style.setProperty('--comment-cancel-text', theme.cardTextMuted);
  root.style.setProperty('--comment-cancel-hover-bg', theme.primaryAlpha10);
  root.style.setProperty('--comment-cancel-hover-text', theme.cardText);
  root.style.setProperty('--comment-reply-bg', theme.primaryAlpha10);
  root.style.setProperty('--comment-reply-border', theme.primaryAlpha30);
  root.style.setProperty('--comment-replies-border', theme.primaryAlpha20);
  root.style.setProperty('--comment-mention-text', theme.primaryColor);
  root.style.setProperty('--comment-mention-bg', theme.primaryAlpha10);
  root.style.setProperty('--comment-mention-border', theme.primaryAlpha20);
  root.style.setProperty('--comment-section-border', theme.primaryAlpha20);
  root.style.setProperty('--comment-header-title-color', theme.cardText);
  root.style.setProperty('--comment-header-title-shadow', 'none');
  root.style.setProperty('--tab-button-bg', 'rgba(255, 255, 255, 0.85)');
  root.style.setProperty('--tab-button-border', theme.primaryAlpha20);
  root.style.setProperty('--tab-button-color', theme.cardText);
  root.style.setProperty('--tab-button-active-bg', accentGradient);
  root.style.setProperty('--tab-button-active-color', '#ffffff');
  root.style.setProperty('--tab-button-active-border', theme.primaryAlpha30);
  root.style.setProperty('--comment-input-bg', 'rgba(255, 255, 255, 0.92)');
  root.style.setProperty('--comment-input-border', theme.primaryAlpha20);
  root.style.setProperty('--comment-input-color', theme.cardText);
  root.style.setProperty('--comment-input-placeholder', theme.cardTextMuted);
  root.style.setProperty('--comment-input-focus-border', theme.primaryColor);
  root.style.setProperty('--comment-input-focus-bg', '#ffffff');
  root.style.setProperty('--preview-content-bg', 'rgba(255, 255, 255, 0.92)');
  root.style.setProperty('--preview-content-border', theme.primaryAlpha20);
  root.style.setProperty('--preview-content-color', theme.cardText);
  root.style.setProperty('--secret-toggle-color', theme.cardText);
  root.style.setProperty('--empty-comments-color', theme.cardTextMuted);
  root.style.setProperty('--comment-submit-bg', accentGradient);
  root.style.setProperty('--comment-submit-hover-bg', accentGradient);
  root.style.setProperty('--comment-author-shadow', 'none');
}

function applyCommentThemeVars(root: HTMLElement, accent: AppAccentVars): void {
  const surface = PAPER_SURFACE;
  const accentGradient = `linear-gradient(135deg, ${accent.primaryLight} 0%, ${accent.primaryDark} 100%)`;

  root.style.setProperty('--comment-bg', surface.primaryBg);
  root.style.setProperty('--comment-bg-hover', '#fffdf8');
  root.style.setProperty('--comment-border', '#e8dcc8');
  root.style.setProperty('--comment-border-hover', accent.primaryAlpha30);
  root.style.setProperty('--comment-header-border', '#e8dcc8');
  root.style.setProperty('--comment-actions-border', accent.primaryAlpha10);
  root.style.setProperty('--comment-text', surface.cardText);
  root.style.setProperty('--comment-author', surface.cardText);
  root.style.setProperty('--comment-date', surface.cardTextMuted);
  root.style.setProperty('--comment-edit-bg', '#fffdf8');
  root.style.setProperty('--comment-edit-border', '#e8dcc8');
  root.style.setProperty('--comment-button-bg', '#fffdf8');
  root.style.setProperty('--comment-button-border', accent.primaryAlpha20);
  root.style.setProperty('--comment-button-text', accent.primaryDark);
  root.style.setProperty('--comment-button-hover-bg', accent.primaryAlpha10);
  root.style.setProperty('--comment-button-hover-border', accent.primaryAlpha30);
  root.style.setProperty('--comment-button-hover-text', accent.primaryColor);
  root.style.setProperty('--comment-cancel-bg', surface.primaryBg);
  root.style.setProperty('--comment-cancel-text', surface.cardTextMuted);
  root.style.setProperty('--comment-cancel-hover-bg', accent.primaryAlpha10);
  root.style.setProperty('--comment-cancel-hover-text', surface.cardText);
  root.style.setProperty('--comment-reply-bg', accent.primaryAlpha10);
  root.style.setProperty('--comment-reply-border', accent.primaryAlpha30);
  root.style.setProperty('--comment-replies-border', accent.primaryAlpha20);
  root.style.setProperty('--comment-mention-text', accent.primaryColor);
  root.style.setProperty('--comment-mention-bg', accent.primaryAlpha10);
  root.style.setProperty('--comment-mention-border', accent.primaryAlpha20);
  root.style.setProperty('--comment-section-border', '#e8dcc8');
  root.style.setProperty('--comment-header-title-color', surface.cardText);
  root.style.setProperty('--comment-header-title-shadow', 'none');
  root.style.setProperty('--tab-button-bg', '#fffdf8');
  root.style.setProperty('--tab-button-border', accent.primaryAlpha20);
  root.style.setProperty('--tab-button-color', surface.cardText);
  root.style.setProperty('--tab-button-active-bg', accentGradient);
  root.style.setProperty('--tab-button-active-color', '#fffdf8');
  root.style.setProperty('--tab-button-active-border', accent.primaryAlpha30);
  root.style.setProperty('--comment-input-bg', '#fffdf8');
  root.style.setProperty('--comment-input-border', '#e8dcc8');
  root.style.setProperty('--comment-input-color', surface.cardText);
  root.style.setProperty('--comment-input-placeholder', surface.cardTextMuted);
  root.style.setProperty('--comment-input-focus-border', accent.primaryColor);
  root.style.setProperty('--comment-input-focus-bg', '#fffdf8');
  root.style.setProperty('--preview-content-bg', '#fffdf8');
  root.style.setProperty('--preview-content-border', '#e8dcc8');
  root.style.setProperty('--preview-content-color', surface.cardText);
  root.style.setProperty('--secret-toggle-color', surface.cardText);
  root.style.setProperty('--empty-comments-color', surface.cardTextMuted);
  root.style.setProperty('--comment-submit-bg', accentGradient);
  root.style.setProperty('--comment-submit-hover-bg', accentGradient);
  root.style.setProperty('--comment-author-shadow', 'none');
}

export function getSavedAppTheme(): AppThemeId {
  try {
    const saved = localStorage.getItem(APP_THEME_STORAGE_KEY);
    if (saved && isAppThemeId(saved)) {
      if (getSavedAppUiStyle() === 'classic' && saved === 'paper') {
        return 'purple';
      }
      return saved;
    }
  } catch {
    /* ignore */
  }
  return getSavedAppUiStyle() === 'classic' ? 'purple' : 'paper';
}

export function getDisplayAppThemeId(
  themeId: AppThemeId,
  uiStyle: AppUiStyleId = getSavedAppUiStyle()
): AppThemeId {
  if (uiStyle === 'classic' && themeId === 'paper') {
    return 'purple';
  }
  return themeId;
}

function resolveClassicThemeId(themeId: AppThemeId): Exclude<AppThemeId, 'paper'> | AppThemeId {
  return themeId === 'paper' ? 'purple' : themeId;
}

function applyLegacyCommentThemeVars(
  root: HTMLElement,
  themeId: AppThemeId,
  theme: AppThemeVars
): void {
  const isDarkSurface = themeId === 'night';
  const accentGradient = `linear-gradient(135deg, ${theme.primaryLight} 0%, ${theme.primaryDark} 100%)`;

  if (isDarkSurface) {
    root.style.setProperty('--comment-bg', 'rgba(30, 41, 59, 0.9)');
    root.style.setProperty('--comment-bg-hover', 'rgba(51, 65, 85, 0.95)');
    root.style.setProperty('--comment-border', 'rgba(148, 163, 184, 0.28)');
    root.style.setProperty('--comment-border-hover', 'rgba(129, 140, 248, 0.45)');
    root.style.setProperty('--comment-header-border', 'rgba(148, 163, 184, 0.2)');
    root.style.setProperty('--comment-actions-border', 'rgba(148, 163, 184, 0.18)');
    root.style.setProperty('--comment-text', theme.pageText);
    root.style.setProperty('--comment-author', theme.pageText);
    root.style.setProperty('--comment-date', theme.pageTextMuted);
    root.style.setProperty('--comment-edit-bg', 'rgba(15, 23, 42, 0.6)');
    root.style.setProperty('--comment-edit-border', 'rgba(148, 163, 184, 0.3)');
    root.style.setProperty('--comment-button-bg', 'rgba(51, 65, 85, 0.6)');
    root.style.setProperty('--comment-button-border', 'rgba(148, 163, 184, 0.25)');
    root.style.setProperty('--comment-button-text', theme.primaryLight);
    root.style.setProperty('--comment-button-hover-bg', theme.primaryAlpha20);
    root.style.setProperty('--comment-button-hover-border', theme.primaryAlpha30);
    root.style.setProperty('--comment-button-hover-text', theme.pageText);
    root.style.setProperty('--comment-cancel-bg', 'rgba(51, 65, 85, 0.5)');
    root.style.setProperty('--comment-cancel-text', theme.pageTextMuted);
    root.style.setProperty('--comment-cancel-hover-bg', 'rgba(71, 85, 105, 0.7)');
    root.style.setProperty('--comment-cancel-hover-text', theme.pageText);
    root.style.setProperty('--comment-reply-bg', 'rgba(51, 65, 85, 0.55)');
    root.style.setProperty('--comment-reply-border', theme.primaryAlpha30);
    root.style.setProperty('--comment-replies-border', 'rgba(148, 163, 184, 0.25)');
    root.style.setProperty('--comment-mention-text', theme.primaryLight);
    root.style.setProperty('--comment-mention-bg', theme.primaryAlpha20);
    root.style.setProperty('--comment-mention-border', theme.primaryAlpha30);
    root.style.setProperty('--comment-section-border', 'rgba(148, 163, 184, 0.2)');
    root.style.setProperty('--comment-header-title-color', theme.pageText);
    root.style.setProperty('--comment-header-title-shadow', 'none');
    root.style.setProperty('--tab-button-bg', 'rgba(51, 65, 85, 0.55)');
    root.style.setProperty('--tab-button-border', 'rgba(148, 163, 184, 0.25)');
    root.style.setProperty('--tab-button-color', theme.pageTextMuted);
    root.style.setProperty('--tab-button-active-bg', accentGradient);
    root.style.setProperty('--tab-button-active-color', '#ffffff');
    root.style.setProperty('--tab-button-active-border', theme.primaryAlpha30);
    root.style.setProperty('--comment-input-bg', 'rgba(30, 41, 59, 0.85)');
    root.style.setProperty('--comment-input-border', 'rgba(148, 163, 184, 0.3)');
    root.style.setProperty('--comment-input-color', theme.pageText);
    root.style.setProperty('--comment-input-placeholder', 'rgba(148, 163, 184, 0.75)');
    root.style.setProperty('--comment-input-focus-border', theme.primaryLight);
    root.style.setProperty('--comment-input-focus-bg', 'rgba(51, 65, 85, 0.9)');
    root.style.setProperty('--preview-content-bg', 'rgba(30, 41, 59, 0.85)');
    root.style.setProperty('--preview-content-border', 'rgba(148, 163, 184, 0.3)');
    root.style.setProperty('--preview-content-color', theme.pageText);
    root.style.setProperty('--secret-toggle-color', theme.pageTextMuted);
    root.style.setProperty('--empty-comments-color', theme.pageTextMuted);
    root.style.setProperty('--comment-submit-bg', accentGradient);
    root.style.setProperty('--comment-submit-hover-bg', accentGradient);
    root.style.setProperty('--comment-author-shadow', 'none');
    return;
  }

  applyClassicCommentThemeVars(root, theme);
}

function applyLegacyAppTheme(themeId: AppThemeId): void {
  const resolved = resolveClassicThemeId(themeId);
  const theme = THEMES[resolved] ?? THEMES.purple;
  const root = document.documentElement;

  root.style.setProperty('--gradient-primary', theme.gradientPrimary);
  root.style.setProperty('--home-gradient', theme.homeGradient);
  root.style.setProperty('--app-page-gradient', theme.appPageGradient);
  root.style.setProperty('--primary-bg', theme.primaryBg);
  root.style.setProperty('--bg-gradient', theme.bgGradient);
  root.style.setProperty('--primary-color', theme.primaryColor);
  root.style.setProperty('--primary-dark', theme.primaryDark);
  root.style.setProperty('--primary-light', theme.primaryLight);
  root.style.setProperty('--christmas-red', theme.primaryColor);
  root.style.setProperty('--primary-alpha-10', theme.primaryAlpha10);
  root.style.setProperty('--primary-alpha-20', theme.primaryAlpha20);
  root.style.setProperty('--primary-alpha-30', theme.primaryAlpha30);
  root.style.setProperty('--shadow-sm', theme.shadowSm);
  root.style.setProperty('--shadow-md', theme.shadowMd);
  root.style.setProperty('--shadow-lg', theme.shadowLg);
  root.style.setProperty('--shadow-color', theme.primaryAlpha20);
  root.style.setProperty('--button-primary-bg', theme.primaryColor);
  root.style.setProperty('--button-primary-hover', theme.primaryDark);

  for (const cssVar of CONTEST_BG_VARS) {
    root.style.setProperty(cssVar, theme.gradientPrimary);
  }

  root.style.setProperty('--app-accent', theme.primaryColor);
  root.style.setProperty('--app-accent-light', theme.primaryLight);
  root.style.setProperty(
    '--app-accent-gradient',
    `linear-gradient(135deg, ${theme.primaryLight} 0%, ${theme.primaryDark} 100%)`
  );
  root.style.setProperty('--cu-bg', theme.gradientPrimary);
  root.style.setProperty('--main-gradient', theme.gradientPrimary);
  root.style.setProperty('--main-gradient-rev', theme.appPageGradient);
  root.style.setProperty('--tab-active-bar', theme.gradientPrimary);
  root.style.setProperty('--contest-select-option-bg', theme.primaryColor);
  root.style.setProperty('--app-page-text', theme.pageText);
  root.style.setProperty('--app-page-text-muted', theme.pageTextMuted);
  root.style.setProperty('--app-card-text', theme.cardText);
  root.style.setProperty('--app-card-text-muted', theme.cardTextMuted);
  root.style.setProperty('--app-glass-text', theme.glassText);
  root.style.setProperty('--empty-comments-icon-color', theme.primaryColor);
  root.style.setProperty('--secret-toggle-hover-color', theme.primaryColor);
  root.style.setProperty('--comment-input-focus', theme.primaryColor);
  root.style.setProperty('--comment-save-bg', theme.primaryColor);

  applyLegacyCommentThemeVars(root, resolved, theme);

  root.setAttribute('data-app-theme', resolved);
  localStorage.setItem(APP_THEME_STORAGE_KEY, resolved);
  window.dispatchEvent(new Event(APP_THEME_CHANGE_EVENT));
}

function applyWarmPaperAppTheme(themeId: AppThemeId): void {
  const surface = PAPER_SURFACE;
  const accent = getAccentForThemeId(themeId);
  const root = document.documentElement;

  root.style.setProperty('--gradient-primary', surface.gradientPrimary);
  root.style.setProperty('--home-gradient', surface.homeGradient);
  root.style.setProperty('--app-page-gradient', surface.appPageGradient);
  root.style.setProperty('--primary-bg', surface.primaryBg);
  root.style.setProperty('--bg-gradient', surface.bgGradient);
  root.style.setProperty('--app-page-text', surface.pageText);
  root.style.setProperty('--app-page-text-muted', surface.pageTextMuted);
  root.style.setProperty('--app-card-text', surface.cardText);
  root.style.setProperty('--app-card-text-muted', surface.cardTextMuted);
  root.style.setProperty('--app-glass-text', surface.glassText);
  root.style.setProperty('--paper-bg', surface.gradientPrimary);
  root.style.setProperty('--paper-card', '#fffdf8');
  root.style.setProperty('--paper-border', '#e8dcc8');
  root.style.setProperty('--paper-ink', surface.pageText);
  root.style.setProperty('--paper-muted', surface.pageTextMuted);
  root.style.setProperty('--paper-body', surface.cardTextMuted);
  root.style.setProperty('--paper-accent', accent.primaryColor);
  root.style.setProperty('--paper-tag-bg', themeId === 'paper' ? '#f0e6d6' : accent.primaryAlpha20);
  root.style.setProperty('--paper-tag-text', surface.cardTextMuted);
  root.style.setProperty('--primary-color', accent.primaryColor);
  root.style.setProperty('--primary-dark', accent.primaryDark);
  root.style.setProperty('--primary-light', accent.primaryLight);
  root.style.setProperty('--christmas-red', accent.primaryColor);
  root.style.setProperty('--primary-alpha-10', accent.primaryAlpha10);
  root.style.setProperty('--primary-alpha-20', accent.primaryAlpha20);
  root.style.setProperty('--primary-alpha-30', accent.primaryAlpha30);
  root.style.setProperty('--shadow-sm', accent.shadowSm);
  root.style.setProperty('--shadow-md', accent.shadowMd);
  root.style.setProperty('--shadow-lg', accent.shadowLg);
  root.style.setProperty('--shadow-color', accent.primaryAlpha20);
  root.style.setProperty('--button-primary-bg', accent.primaryColor);
  root.style.setProperty('--button-primary-hover', accent.primaryDark);

  for (const cssVar of CONTEST_BG_VARS) {
    root.style.setProperty(cssVar, surface.gradientPrimary);
  }

  root.style.setProperty('--app-accent', accent.primaryColor);
  root.style.setProperty('--app-accent-light', accent.primaryLight);
  root.style.setProperty(
    '--app-accent-gradient',
    `linear-gradient(135deg, ${accent.primaryLight} 0%, ${accent.primaryDark} 100%)`
  );
  root.style.setProperty('--cu-bg', surface.gradientPrimary);
  root.style.setProperty('--main-gradient', surface.gradientPrimary);
  root.style.setProperty('--main-gradient-rev', surface.appPageGradient);
  root.style.setProperty('--tab-active-bar', accent.primaryColor);
  root.style.setProperty('--contest-select-option-bg', accent.primaryColor);
  root.style.setProperty('--empty-comments-icon-color', accent.primaryColor);
  root.style.setProperty('--secret-toggle-hover-color', accent.primaryColor);
  root.style.setProperty('--comment-input-focus', accent.primaryColor);
  root.style.setProperty('--comment-save-bg', accent.primaryColor);

  applyCommentThemeVars(root, accent);

  if (getSavedBottomNavThemeId() === 'paper') {
    syncPaperNavAccent(root, accent);
  }

  root.setAttribute('data-app-theme', themeId);
  localStorage.setItem(APP_THEME_STORAGE_KEY, themeId);
  window.dispatchEvent(new Event(APP_THEME_CHANGE_EVENT));
}

export function applyAppTheme(themeId: AppThemeId): void {
  if (getSavedAppUiStyle() === 'classic') {
    applyLegacyAppTheme(themeId);
    return;
  }
  applyWarmPaperAppTheme(themeId);
}
