import React from 'react';
import { getSavedAppUiStyle } from '../utils/appUiStyleStorage';
import HomeClassic from './HomeClassic';
import HomeNotebook from './HomeNotebook';

const Home: React.FC = () => {
  return getSavedAppUiStyle() === 'classic' ? <HomeClassic /> : <HomeNotebook />;
};

export default Home;
