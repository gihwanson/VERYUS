export const APP_THEME_STORAGE_KEY = 'veryus_app_theme';
export const APP_THEME_CHANGE_EVENT = 'veryus-app-theme-change';

export type AppThemeId =
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
  purple: {
    gradientPrimary: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    homeGradient: 'linear-gradient(160deg, #667eea 0%, #764ba2 55%, #6b5ce7 100%)',
    appPageGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    primaryBg: 'linear-gradient(135deg, #E8F4F8 0%, #D1E7F0 50%, #B8D9E8 100%)',
    bgGradient: 'linear-gradient(135deg, #E5DAF5 0%, #D4C2F0 100%)',
    primaryColor: '#C41E3A',
    primaryDark: '#A01D2E',
    primaryLight: '#DC3545',
    primaryAlpha10: 'rgba(196, 30, 58, 0.1)',
    primaryAlpha20: 'rgba(196, 30, 58, 0.2)',
    primaryAlpha30: 'rgba(196, 30, 58, 0.3)',
    shadowSm: '0 4px 6px rgba(102, 126, 234, 0.15)',
    shadowMd: '0 8px 25px rgba(102, 126, 234, 0.2)',
    shadowLg: '0 20px 40px rgba(102, 126, 234, 0.25)',
    pageText: '#ffffff',
    pageTextMuted: 'rgba(255, 255, 255, 0.85)',
    cardText: '#111827',
    cardTextMuted: '#6b7280',
    glassText: '#1a1a2e',
  },
  sky: {
    gradientPrimary: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
    homeGradient: 'linear-gradient(160deg, #7dd3fc 0%, #0ea5e9 55%, #0284c7 100%)',
    appPageGradient: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
    primaryBg: 'linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 50%, #7DD3FC 100%)',
    bgGradient: 'linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 100%)',
    primaryColor: '#0284C7',
    primaryDark: '#0369A1',
    primaryLight: '#0EA5E9',
    primaryAlpha10: 'rgba(2, 132, 199, 0.1)',
    primaryAlpha20: 'rgba(2, 132, 199, 0.2)',
    primaryAlpha30: 'rgba(2, 132, 199, 0.3)',
    shadowSm: '0 4px 6px rgba(14, 165, 233, 0.15)',
    shadowMd: '0 8px 25px rgba(14, 165, 233, 0.2)',
    shadowLg: '0 20px 40px rgba(14, 165, 233, 0.25)',
    pageText: '#ffffff',
    pageTextMuted: 'rgba(255, 255, 255, 0.88)',
    cardText: '#0f172a',
    cardTextMuted: '#475569',
    glassText: '#0f172a',
  },
  rose: {
    gradientPrimary: 'linear-gradient(135deg, #fb7185 0%, #e11d48 100%)',
    homeGradient: 'linear-gradient(160deg, #fda4af 0%, #e11d48 55%, #be123c 100%)',
    appPageGradient: 'linear-gradient(135deg, #fb7185 0%, #e11d48 100%)',
    primaryBg: 'linear-gradient(135deg, #FFF1F2 0%, #FFE4E6 50%, #FECDD3 100%)',
    bgGradient: 'linear-gradient(135deg, #FFF1F2 0%, #FECDD3 100%)',
    primaryColor: '#E11D48',
    primaryDark: '#BE123C',
    primaryLight: '#FB7185',
    primaryAlpha10: 'rgba(225, 29, 72, 0.1)',
    primaryAlpha20: 'rgba(225, 29, 72, 0.2)',
    primaryAlpha30: 'rgba(225, 29, 72, 0.3)',
    shadowSm: '0 4px 6px rgba(225, 29, 72, 0.12)',
    shadowMd: '0 8px 25px rgba(225, 29, 72, 0.18)',
    shadowLg: '0 20px 40px rgba(225, 29, 72, 0.22)',
    pageText: '#ffffff',
    pageTextMuted: 'rgba(255, 255, 255, 0.88)',
    cardText: '#1f2937',
    cardTextMuted: '#6b7280',
    glassText: '#1f2937',
  },
  mint: {
    gradientPrimary: 'linear-gradient(135deg, #34d399 0%, #059669 100%)',
    homeGradient: 'linear-gradient(160deg, #6ee7b7 0%, #059669 55%, #047857 100%)',
    appPageGradient: 'linear-gradient(135deg, #34d399 0%, #059669 100%)',
    primaryBg: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 50%, #A7F3D0 100%)',
    bgGradient: 'linear-gradient(135deg, #ECFDF5 0%, #A7F3D0 100%)',
    primaryColor: '#059669',
    primaryDark: '#047857',
    primaryLight: '#34D399',
    primaryAlpha10: 'rgba(5, 150, 105, 0.1)',
    primaryAlpha20: 'rgba(5, 150, 105, 0.2)',
    primaryAlpha30: 'rgba(5, 150, 105, 0.3)',
    shadowSm: '0 4px 6px rgba(5, 150, 105, 0.12)',
    shadowMd: '0 8px 25px rgba(5, 150, 105, 0.18)',
    shadowLg: '0 20px 40px rgba(5, 150, 105, 0.22)',
    pageText: '#ffffff',
    pageTextMuted: 'rgba(255, 255, 255, 0.88)',
    cardText: '#14532d',
    cardTextMuted: '#4b5563',
    glassText: '#14532d',
  },
  sunset: {
    gradientPrimary: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)',
    homeGradient: 'linear-gradient(160deg, #fdba74 0%, #ea580c 55%, #c2410c 100%)',
    appPageGradient: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)',
    primaryBg: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 50%, #FED7AA 100%)',
    bgGradient: 'linear-gradient(135deg, #FFF7ED 0%, #FED7AA 100%)',
    primaryColor: '#EA580C',
    primaryDark: '#C2410C',
    primaryLight: '#FB923C',
    primaryAlpha10: 'rgba(234, 88, 12, 0.1)',
    primaryAlpha20: 'rgba(234, 88, 12, 0.2)',
    primaryAlpha30: 'rgba(234, 88, 12, 0.3)',
    shadowSm: '0 4px 6px rgba(234, 88, 12, 0.12)',
    shadowMd: '0 8px 25px rgba(234, 88, 12, 0.18)',
    shadowLg: '0 20px 40px rgba(234, 88, 12, 0.22)',
    pageText: '#ffffff',
    pageTextMuted: 'rgba(255, 255, 255, 0.9)',
    cardText: '#1f2937',
    cardTextMuted: '#6b7280',
    glassText: '#1f2937',
  },
  lavender: {
    gradientPrimary: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
    homeGradient: 'linear-gradient(160deg, #c4b5fd 0%, #7c3aed 55%, #6d28d9 100%)',
    appPageGradient: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
    primaryBg: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 50%, #DDD6FE 100%)',
    bgGradient: 'linear-gradient(135deg, #F5F3FF 0%, #DDD6FE 100%)',
    primaryColor: '#7C3AED',
    primaryDark: '#6D28D9',
    primaryLight: '#A78BFA',
    primaryAlpha10: 'rgba(124, 58, 237, 0.1)',
    primaryAlpha20: 'rgba(124, 58, 237, 0.2)',
    primaryAlpha30: 'rgba(124, 58, 237, 0.3)',
    shadowSm: '0 4px 6px rgba(124, 58, 237, 0.12)',
    shadowMd: '0 8px 25px rgba(124, 58, 237, 0.18)',
    shadowLg: '0 20px 40px rgba(124, 58, 237, 0.22)',
    pageText: '#ffffff',
    pageTextMuted: 'rgba(255, 255, 255, 0.88)',
    cardText: '#1e1b4b',
    cardTextMuted: '#4b5563',
    glassText: '#1e1b4b',
  },
  night: {
    gradientPrimary: 'linear-gradient(135deg, #334155 0%, #0f172a 100%)',
    homeGradient: 'linear-gradient(160deg, #475569 0%, #1e293b 55%, #0f172a 100%)',
    appPageGradient: 'linear-gradient(135deg, #334155 0%, #0f172a 100%)',
    primaryBg: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)',
    bgGradient: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    primaryColor: '#818CF8',
    primaryDark: '#6366F1',
    primaryLight: '#A5B4FC',
    primaryAlpha10: 'rgba(129, 140, 248, 0.15)',
    primaryAlpha20: 'rgba(129, 140, 248, 0.25)',
    primaryAlpha30: 'rgba(129, 140, 248, 0.35)',
    shadowSm: '0 4px 6px rgba(0, 0, 0, 0.25)',
    shadowMd: '0 8px 25px rgba(0, 0, 0, 0.35)',
    shadowLg: '0 20px 40px rgba(0, 0, 0, 0.45)',
    pageText: '#f8fafc',
    pageTextMuted: 'rgba(248, 250, 252, 0.82)',
    cardText: '#0f172a',
    cardTextMuted: '#64748b',
    glassText: '#0f172a',
  },
};

export const APP_THEME_OPTIONS: AppThemeOption[] = [
  { id: 'purple', label: '퍼플', preview: 'linear-gradient(135deg, #667eea, #764ba2)' },
  { id: 'sky', label: '하늘', preview: 'linear-gradient(135deg, #38bdf8, #0ea5e9)' },
  { id: 'rose', label: '로즈', preview: 'linear-gradient(135deg, #fb7185, #e11d48)' },
  { id: 'mint', label: '민트', preview: 'linear-gradient(135deg, #34d399, #059669)' },
  { id: 'sunset', label: '선셋', preview: 'linear-gradient(135deg, #fb923c, #ea580c)' },
  { id: 'lavender', label: '라벤더', preview: 'linear-gradient(135deg, #a78bfa, #7c3aed)' },
  { id: 'night', label: '나이트', preview: 'linear-gradient(135deg, #334155, #0f172a)' },
];

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

function applyCommentThemeVars(
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

  root.style.setProperty('--comment-bg', 'rgba(255, 255, 255, 0.92)');
  root.style.setProperty('--comment-bg-hover', 'rgba(255, 255, 255, 0.98)');
  root.style.setProperty('--comment-border', 'rgba(0, 0, 0, 0.08)');
  root.style.setProperty('--comment-border-hover', theme.primaryAlpha30);
  root.style.setProperty('--comment-header-border', theme.primaryAlpha20);
  root.style.setProperty('--comment-actions-border', theme.primaryAlpha10);
  root.style.setProperty('--comment-text', theme.cardText);
  root.style.setProperty('--comment-author', theme.cardText);
  root.style.setProperty('--comment-date', theme.cardTextMuted);
  root.style.setProperty('--comment-edit-bg', 'rgba(255, 255, 255, 0.95)');
  root.style.setProperty('--comment-edit-border', 'rgba(0, 0, 0, 0.1)');
  root.style.setProperty('--comment-button-bg', 'rgba(255, 255, 255, 0.85)');
  root.style.setProperty('--comment-button-border', theme.primaryAlpha20);
  root.style.setProperty('--comment-button-text', theme.primaryDark);
  root.style.setProperty('--comment-button-hover-bg', theme.primaryAlpha10);
  root.style.setProperty('--comment-button-hover-border', theme.primaryAlpha30);
  root.style.setProperty('--comment-button-hover-text', theme.primaryColor);
  root.style.setProperty('--comment-cancel-bg', 'rgba(243, 244, 246, 0.95)');
  root.style.setProperty('--comment-cancel-text', theme.cardTextMuted);
  root.style.setProperty('--comment-cancel-hover-bg', 'rgba(229, 231, 235, 0.98)');
  root.style.setProperty('--comment-cancel-hover-text', theme.cardText);
  root.style.setProperty('--comment-reply-bg', theme.primaryAlpha10);
  root.style.setProperty('--comment-reply-border', theme.primaryAlpha30);
  root.style.setProperty('--comment-replies-border', theme.primaryAlpha20);
  root.style.setProperty('--comment-mention-text', theme.primaryColor);
  root.style.setProperty('--comment-mention-bg', theme.primaryAlpha10);
  root.style.setProperty('--comment-mention-border', theme.primaryAlpha20);
  root.style.setProperty('--comment-section-border', 'rgba(255, 255, 255, 0.35)');
  root.style.setProperty('--comment-header-title-color', theme.cardText);
  root.style.setProperty('--comment-header-title-shadow', 'none');
  root.style.setProperty('--tab-button-bg', 'rgba(255, 255, 255, 0.75)');
  root.style.setProperty('--tab-button-border', theme.primaryAlpha20);
  root.style.setProperty('--tab-button-color', theme.cardText);
  root.style.setProperty('--tab-button-active-bg', accentGradient);
  root.style.setProperty('--tab-button-active-color', '#ffffff');
  root.style.setProperty('--tab-button-active-border', theme.primaryAlpha30);
  root.style.setProperty('--comment-input-bg', 'rgba(255, 255, 255, 0.95)');
  root.style.setProperty('--comment-input-border', 'rgba(0, 0, 0, 0.12)');
  root.style.setProperty('--comment-input-color', theme.cardText);
  root.style.setProperty('--comment-input-placeholder', theme.cardTextMuted);
  root.style.setProperty('--comment-input-focus-border', theme.primaryColor);
  root.style.setProperty('--comment-input-focus-bg', '#ffffff');
  root.style.setProperty('--preview-content-bg', 'rgba(255, 255, 255, 0.95)');
  root.style.setProperty('--preview-content-border', 'rgba(0, 0, 0, 0.1)');
  root.style.setProperty('--preview-content-color', theme.cardText);
  root.style.setProperty('--secret-toggle-color', theme.cardText);
  root.style.setProperty('--empty-comments-color', theme.cardTextMuted);
  root.style.setProperty('--comment-submit-bg', accentGradient);
  root.style.setProperty('--comment-submit-hover-bg', accentGradient);
  root.style.setProperty('--comment-author-shadow', 'none');
}

export function getSavedAppTheme(): AppThemeId {
  try {
    const saved = localStorage.getItem(APP_THEME_STORAGE_KEY);
    if (saved && isAppThemeId(saved)) return saved;
  } catch {
    /* ignore */
  }
  return 'purple';
}

export function applyAppTheme(themeId: AppThemeId): void {
  const theme = THEMES[themeId] ?? THEMES.purple;
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

  applyCommentThemeVars(root, themeId, theme);

  root.setAttribute('data-app-theme', themeId);
  localStorage.setItem(APP_THEME_STORAGE_KEY, themeId);
  window.dispatchEvent(new Event(APP_THEME_CHANGE_EVENT));
}
