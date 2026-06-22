import React from 'react';
import { getSavedAppUiStyle } from '../utils/appUiStyleStorage';
import ApprovedSongsClassic from './ApprovedSongsClassic';
import ApprovedSongsNotebook from './ApprovedSongsNotebook';

const ApprovedSongs: React.FC = () => {
  return getSavedAppUiStyle() === 'classic' ? <ApprovedSongsClassic /> : <ApprovedSongsNotebook />;
};

export default ApprovedSongs;
