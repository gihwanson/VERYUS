import React from 'react';
import { getSavedAppUiStyle } from '../utils/appUiStyleStorage';
import ContestListClassic from './ContestListClassic';
import ContestListNotebook from './ContestListNotebook';

const ContestList: React.FC = () => {
  return getSavedAppUiStyle() === 'classic' ? <ContestListClassic /> : <ContestListNotebook />;
};

export default ContestList;
