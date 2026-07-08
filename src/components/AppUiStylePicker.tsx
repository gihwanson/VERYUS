import React, { useEffect, useState } from 'react';
import {
  APP_UI_STYLE_CHANGE_EVENT,
  APP_UI_STYLE_OPTIONS,
  getSavedAppUiStyle,
  setAppUiStyle,
  type AppUiStyleId,
} from '../utils/appUiStyle';
import ThemeSwatchPicker from './ThemeSwatchPicker';

const AppUiStylePicker: React.FC = () => {
  const [selected, setSelected] = useState<AppUiStyleId>(getSavedAppUiStyle);

  useEffect(() => {
    const sync = () => setSelected(getSavedAppUiStyle());
    window.addEventListener(APP_UI_STYLE_CHANGE_EVENT, sync);
    return () => window.removeEventListener(APP_UI_STYLE_CHANGE_EVENT, sync);
  }, []);

  const handleSelect = (styleId: string) => {
    const next = styleId as AppUiStyleId;
    setAppUiStyle(next);
    setSelected(next);
  };

  return (
    <ThemeSwatchPicker
      options={APP_UI_STYLE_OPTIONS}
      selectedId={selected}
      onSelect={handleSelect}
      description="웜페이지(현재) 디자인이 기본으로 적용됩니다. 선택 시 화면이 새로고침되며, 앱 테마 색상 설정은 그대로 유지됩니다."
      ariaLabel="화면 디자인 스타일"
    />
  );
};

export default AppUiStylePicker;
