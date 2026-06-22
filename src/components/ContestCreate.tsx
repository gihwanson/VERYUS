import React from 'react';
import { getSavedAppUiStyle } from '../utils/appUiStyleStorage';
import ContestCreateClassic from './ContestCreateClassic';
import ContestCreateNotebook from './ContestCreateNotebook';

const ContestCreate: React.FC = () => {
  return getSavedAppUiStyle() === 'classic' ? <ContestCreateClassic /> : <ContestCreateNotebook />;
};

export default ContestCreate;
