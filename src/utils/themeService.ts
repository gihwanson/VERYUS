import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'veryus_theme';

// 시스템 테마 감지
const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

// 저장된 테마 불러오기
const getStoredTheme = (): Theme => {
  if (typeof window === 'undefined') return 'system';
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      return stored as Theme;
    }
  } catch (error) {
    console.error('테마 불러오기 실패:', error);
  }
  
  return 'system';
};

// 테마 저장
const storeTheme = (theme: Theme): void => {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (error) {
    console.error('테마 저장 실패:', error);
  }
};

// 실제 적용할 테마 결정
const resolveTheme = (theme: Theme): ResolvedTheme => {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
};

// DOM에 테마 적용
const applyTheme = (theme: ResolvedTheme): void => {
  if (typeof document === 'undefined') return;
  
  const root = document.documentElement;
  
  if (theme === 'dark') {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
  } else {
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
  }
  
  // 메타 테마 컬러 변경 (모바일)
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', theme === 'dark' ? '#1F1F1F' : '#8A55CC');
  }
};

// 테마 훅
export const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => 
    resolveTheme(getStoredTheme())
  );

  // 시스템 테마 변경 감지
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      if (theme === 'system') {
        const newResolvedTheme = getSystemTheme();
        setResolvedTheme(newResolvedTheme);
        applyTheme(newResolvedTheme);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // 테마 변경
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    storeTheme(newTheme);
    
    const newResolvedTheme = resolveTheme(newTheme);
    setResolvedTheme(newResolvedTheme);
    applyTheme(newResolvedTheme);
  }, []);

  // 초기 테마 적용
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, []);

  return {
    theme,
    resolvedTheme,
    setTheme,
    isDark: resolvedTheme === 'dark'
  };
};

// 테마 초기화 (SSR 호환)
export const initializeTheme = (): void => {
  if (typeof window === 'undefined') return;
  
  const theme = getStoredTheme();
  const resolvedTheme = resolveTheme(theme);
  applyTheme(resolvedTheme);
};

// CSS 변수 업데이트
export const updateCSSVariables = (theme: ResolvedTheme): void => {
  if (typeof document === 'undefined') return;
  
  const root = document.documentElement;
  
  if (theme === 'dark') {
    // 다크모드 CSS 변수
    root.style.setProperty('--primary-bg', '#121212');
    root.style.setProperty('--secondary-bg', '#1E1E1E');
    root.style.setProperty('--card-bg', '#2A2A2A');
    root.style.setProperty('--text-primary', '#FFFFFF');
    root.style.setProperty('--text-secondary', '#B3B3B3');
    root.style.setProperty('--text-muted', '#808080');
    root.style.setProperty('--border-color', '#404040');
    root.style.setProperty('--shadow-light', 'rgba(255, 255, 255, 0.1)');
    root.style.setProperty('--shadow-medium', 'rgba(0, 0, 0, 0.3)');
    root.style.setProperty('--shadow-strong', 'rgba(0, 0, 0, 0.5)');
    root.style.setProperty('--input-bg', '#333333');
    root.style.setProperty('--hover-bg', '#383838');
    root.style.setProperty('--success-bg', '#1B4D3E');
    root.style.setProperty('--warning-bg', '#4D3319');
    root.style.setProperty('--error-bg', '#4D1919');
  } else {
    // 라이트모드 CSS 변수
    root.style.setProperty('--primary-bg', '#FFFFFF');
    root.style.setProperty('--secondary-bg', '#F8F9FA');
    root.style.setProperty('--card-bg', '#FFFFFF');
    root.style.setProperty('--text-primary', '#1F2937');
    root.style.setProperty('--text-secondary', '#6B7280');
    root.style.setProperty('--text-muted', '#9CA3AF');
    root.style.setProperty('--border-color', '#E5E7EB');
    root.style.setProperty('--shadow-light', 'rgba(0, 0, 0, 0.05)');
    root.style.setProperty('--shadow-medium', 'rgba(0, 0, 0, 0.1)');
    root.style.setProperty('--shadow-strong', 'rgba(0, 0, 0, 0.25)');
    root.style.setProperty('--input-bg', '#FFFFFF');
    root.style.setProperty('--hover-bg', '#F3F4F6');
    root.style.setProperty('--success-bg', '#ECFDF5');
    root.style.setProperty('--warning-bg', '#FFFBEB');
    root.style.setProperty('--error-bg', '#FEF2F2');
  }
};

// 테마별 색상 팔레트
export const themeColors = {
  light: {
    primary: '#8A55CC',
    primaryHover: '#7A47BC',
    secondary: '#6B7280',
    accent: '#F59E0B',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    background: '#FFFFFF',
    surface: '#F8F9FA',
    card: '#FFFFFF',
    text: '#1F2937',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    border: '#E5E7EB',
    divider: '#F3F4F6'
  },
  dark: {
    primary: '#9F6ADB',
    primaryHover: '#8F5ACB',
    secondary: '#9CA3AF',
    accent: '#FBBF24',
    success: '#34D399',
    warning: '#FBBF24',
    error: '#F87171',
    info: '#60A5FA',
    background: '#121212',
    surface: '#1E1E1E',
    card: '#2A2A2A',
    text: '#FFFFFF',
    textSecondary: '#B3B3B3',
    textMuted: '#808080',
    border: '#404040',
    divider: '#333333'
  }
};

// 애니메이션 지원 여부 확인
export const shouldReduceMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// 테마 토글 애니메이션
export const animateThemeTransition = (): void => {
  if (shouldReduceMotion()) return;
  
  const root = document.documentElement;
  root.style.transition = 'background-color 0.3s ease, color 0.3s ease';
  
  setTimeout(() => {
    root.style.transition = '';
  }, 300);
}; 