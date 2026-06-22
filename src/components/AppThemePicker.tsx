import React, { useEffect, useState } from 'react';
import {
  applyAppTheme,
  APP_THEME_CHANGE_EVENT,
  getAppThemeOptions,
  getDisplayAppThemeId,
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

  const displaySelected = getDisplayAppThemeId(selected, uiStyle);

  return (
    <ThemeSwatchPicker
      options={getAppThemeOptions(uiStyle)}
      selectedId={displaySelected}
      onSelect={handleSelect}
      description="앱 전체 배경·강조 색상을 선택하세요. 홈, 게시판, 마이페이지, 콘테스트 등에 적용됩니다."
      ariaLabel="앱 테마 색상"
    />
  );
};

export default AppThemePicker;
