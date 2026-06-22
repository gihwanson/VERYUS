import React from 'react';
import { getSavedAppUiStyle } from '../utils/appUiStyleStorage';
import SetListClassic from './SetListClassic';
import SetListNotebook from './SetListNotebook';

const SetList: React.FC = () => {
  return getSavedAppUiStyle() === 'classic' ? <SetListClassic /> : <SetListNotebook />;
};

export default SetList;
