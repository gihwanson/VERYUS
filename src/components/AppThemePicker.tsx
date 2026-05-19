import React, { useEffect, useState } from 'react';
import {
  applyAppTheme,
  APP_THEME_CHANGE_EVENT,
  APP_THEME_OPTIONS,
  getSavedAppTheme,
  type AppThemeId,
} from '../utils/appTheme';
import ThemeSwatchPicker from './ThemeSwatchPicker';

const AppThemePicker: React.FC = () => {
  const [selected, setSelected] = useState<AppThemeId>(getSavedAppTheme);

  useEffect(() => {
    const sync = () => setSelected(getSavedAppTheme());
    window.addEventListener(APP_THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(APP_THEME_CHANGE_EVENT, sync);
  }, []);

  const handleSelect = (themeId: string) => {
    applyAppTheme(themeId as AppThemeId);
    setSelected(themeId as AppThemeId);
  };

  return (
    <ThemeSwatchPicker
      options={APP_THEME_OPTIONS}
      selectedId={selected}
      onSelect={handleSelect}
      description="앱 전체 배경·강조 색상을 선택하세요. 게시판, 홈, 콘테스트 등에 적용됩니다."
      ariaLabel="앱 테마 색상"
    />
  );
};

export default AppThemePicker;
