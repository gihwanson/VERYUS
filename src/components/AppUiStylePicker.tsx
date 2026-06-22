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
      description="노트북 스타일이 익숙하지 않다면 클래식(이전) 디자인으로 되돌릴 수 있습니다. 선택 시 화면이 새로고침되며, 강조 색상 설정은 그대로 유지됩니다."
      ariaLabel="화면 디자인 스타일"
    />
  );
};

export default AppUiStylePicker;
