import React, { memo } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, animateThemeTransition, type Theme } from '../utils/themeService';
import './ThemeToggle.css';

interface ThemeToggleProps {
  variant?: 'default' | 'compact' | 'icon-only';
  showLabels?: boolean;
  className?: string;
}

const ThemeToggle: React.FC<ThemeToggleProps> = memo(({ 
  variant = 'default',
  showLabels = true,
  className = ''
}) => {
  const { theme, setTheme, isDark } = useTheme();
  
  const themes: Array<{ value: Theme; icon: React.ReactNode; label: string }> = [
    { value: 'light', icon: <Sun size={16} />, label: '라이트' },
    { value: 'system', icon: <Monitor size={16} />, label: '시스템' },
    { value: 'dark', icon: <Moon size={16} />, label: '다크' }
  ];
  
  const handleThemeChange = (newTheme: Theme) => {
    animateThemeTransition();
    setTheme(newTheme);
  };
  
  if (variant === 'icon-only') {
    return (
      <button
        className={`theme-toggle-icon ${isDark ? 'dark' : 'light'} ${className}`}
        onClick={() => handleThemeChange(theme === 'dark' ? 'light' : 'dark')}
        title={`${isDark ? '라이트' : '다크'} 모드로 변경`}
        aria-label="테마 변경"
      >
        <div className="icon-wrapper">
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </div>
      </button>
    );
  }
  
  if (variant === 'compact') {
    return (
      <div className={`theme-toggle-compact ${className}`}>
        <div className="toggle-switch">
          <input
            type="checkbox"
            id="theme-toggle"
            checked={isDark}
            onChange={() => handleThemeChange(isDark ? 'light' : 'dark')}
            className="toggle-input"
          />
          <label htmlFor="theme-toggle" className="toggle-label">
            <div className="toggle-slider">
              <div className="toggle-icon">
                {isDark ? <Moon size={14} /> : <Sun size={14} />}
              </div>
            </div>
          </label>
        </div>
        {showLabels && (
          <span className="toggle-text">
            {isDark ? '다크' : '라이트'}
          </span>
        )}
      </div>
    );
  }
  
  return (
    <div className={`theme-toggle-default ${className}`}>
      {showLabels && (
        <label className="toggle-title">테마</label>
      )}
      <div className="theme-options">
        {themes.map((themeOption) => (
          <button
            key={themeOption.value}
            className={`theme-option ${theme === themeOption.value ? 'active' : ''}`}
            onClick={() => handleThemeChange(themeOption.value)}
            title={`${themeOption.label} 모드`}
            aria-label={`${themeOption.label} 모드로 변경`}
          >
            <div className="option-icon">
              {themeOption.icon}
            </div>
            {showLabels && (
              <span className="option-label">
                {themeOption.label}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
});

ThemeToggle.displayName = 'ThemeToggle';

export default ThemeToggle; 