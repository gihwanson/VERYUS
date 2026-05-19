import React, { useEffect, useState } from 'react';
import {
  applyBottomNavTheme,
  BOTTOM_NAV_THEME_CHANGE_EVENT,
  BOTTOM_NAV_THEME_OPTIONS,
  getSavedBottomNavTheme,
  type BottomNavThemeId,
} from '../utils/bottomNavTheme';
import ThemeSwatchPicker from './ThemeSwatchPicker';

interface BottomNavThemePickerProps {
  compact?: boolean;
}

const BottomNavThemePicker: React.FC<BottomNavThemePickerProps> = ({ compact = false }) => {
  const [selected, setSelected] = useState<BottomNavThemeId>(getSavedBottomNavTheme);

  useEffect(() => {
    const sync = () => setSelected(getSavedBottomNavTheme());
    window.addEventListener(BOTTOM_NAV_THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(BOTTOM_NAV_THEME_CHANGE_EVENT, sync);
  }, []);

  const handleSelect = (themeId: string) => {
    applyBottomNavTheme(themeId as BottomNavThemeId);
    setSelected(themeId as BottomNavThemeId);
  };

  return (
    <ThemeSwatchPicker
      options={BOTTOM_NAV_THEME_OPTIONS}
      selectedId={selected}
      onSelect={handleSelect}
      description="하단 네비게이션 바 색상을 선택하세요. 이 기기에만 저장됩니다."
      ariaLabel="하단 네비게이션 색상"
      compact={compact}
    />
  );
};

export default BottomNavThemePicker;
