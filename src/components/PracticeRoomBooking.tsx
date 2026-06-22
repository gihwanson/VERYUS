import React from 'react';
import { getSavedAppUiStyle } from '../utils/appUiStyleStorage';
import PracticeRoomBookingClassic from './PracticeRoomBookingClassic';
import PracticeRoomBookingNotebook from './PracticeRoomBookingNotebook';

const PracticeRoomBooking: React.FC = () => {
  return getSavedAppUiStyle() === 'classic' ? (
    <PracticeRoomBookingClassic />
  ) : (
    <PracticeRoomBookingNotebook />
  );
};

export default PracticeRoomBooking;
