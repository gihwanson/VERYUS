import React, { useState } from 'react';
import {
  isGameSoundEnabled,
  setGameSoundEnabled,
  unlockGameAudio,
} from '../../utils/gameSounds';

const GameSoundToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [on, setOn] = useState(isGameSoundEnabled);

  const toggle = () => {
    const next = !on;
    setOn(next);
    setGameSoundEnabled(next);
    if (next) {
      unlockGameAudio();
    }
  };

  return (
    <button
      type="button"
      className={`game-sound-toggle${className ? ` ${className}` : ''}`}
      onClick={toggle}
      aria-pressed={on}
    >
      {on ? '🔊 효과음' : '🔇 효과음 끔'}
    </button>
  );
};

export default GameSoundToggle;
