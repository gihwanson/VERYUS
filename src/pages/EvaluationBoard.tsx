import React, { useEffect } from 'react';

const EvaluationBoard: React.FC = () => {
  useEffect(() => {
    return () => {
      const audios = document.querySelectorAll('audio');
      audios.forEach(audio => (audio as HTMLAudioElement).pause());
    };
  }, []);

  return <div />;
};

export default EvaluationBoard; 