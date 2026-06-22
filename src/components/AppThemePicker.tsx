import React, { useEffect, useState } from 'react';
import {
  applyAppTheme,
  APP_THEME_CHANGE_EVENT,
  APP_THEME_OPTIONS,
  getSavedAppTheme,
  type AppThemeId,
} from '../utils/appTheme';
import { APP_UI_STYLE_CHANGE_EVENT, getSavedAppUiStyle } from '../utils/appUiStyle';
import ThemeSwatchPicker from './ThemeSwatchPicker';

const AppThemePicker: React.FC = () => {
  const [selected, setSelected] = useState<AppThemeId>(getSavedAppTheme);
  const [uiStyle, setUiStyle] = useState(getSavedAppUiStyle);

  useEffect(() => {
    const sync = () => {
      setSelected(getSavedAppTheme());
      setUiStyle(getSavedAppUiStyle());
    };
    window.addEventListener(APP_THEME_CHANGE_EVENT, sync);
    window.addEventListener(APP_UI_STYLE_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener(APP_THEME_CHANGE_EVENT, sync);
      window.removeEventListener(APP_UI_STYLE_CHANGE_EVENT, sync);
    };
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
      description={
        uiStyle === 'classic'
          ? '클래식 모드에서 버튼·링크·탭 등에 적용할 강조 색상을 선택하세요.'
          : '웜 페이퍼 화면 위에 적용할 강조 색상을 선택하세요. 버튼·링크·탭 등에 반영됩니다.'
      }
      ariaLabel="앱 테마 색상"
    />
  );
};

export default AppThemePicker;
