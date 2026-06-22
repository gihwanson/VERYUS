import React from 'react';
import { getSavedAppUiStyle } from '../utils/appUiStyleStorage';
import MyPageClassic from './MyPageClassic';
import MyPageNotebook from './MyPageNotebook';

const MyPage: React.FC = () => {
  return getSavedAppUiStyle() === 'classic' ? <MyPageClassic /> : <MyPageNotebook />;
};

export default MyPage;
