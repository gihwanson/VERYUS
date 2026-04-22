import React from 'react';
import './GlobalLoadingScreen.css';

interface GlobalLoadingScreenProps {
  message?: string;
  fullScreen?: boolean;
}

const GlobalLoadingScreen: React.FC<GlobalLoadingScreenProps> = ({
  message = '잠시만 기다려주세요',
  fullScreen = true
}) => {
  return (
    <div className={`global-loading ${fullScreen ? 'fullscreen' : 'inline'}`}>
      <div className="global-loading__card" role="status" aria-live="polite" aria-busy="true">
        <div className="global-loading__spinner" />
        <p className="global-loading__text">{message}</p>
      </div>
    </div>
  );
};

export default GlobalLoadingScreen;
