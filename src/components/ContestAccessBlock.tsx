import React from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  contestId: string;
  title?: string;
  message: string;
  icon?: string;
}

const ContestAccessBlock: React.FC<Props> = ({
  contestId,
  title = '참여할 수 없습니다',
  message,
  icon = '🔒',
}) => {
  const navigate = useNavigate();

  return (
    <div className="contest-ui-refresh contest-access-block-screen">
      <div className="contest-access-block-card">
        <div className="contest-access-block-icon" aria-hidden>
          {icon}
        </div>
        <h2 className="contest-access-block-title">{title}</h2>
        <p className="contest-access-block-message">{message}</p>
        <button
          type="button"
          className="contest-back-button"
          onClick={() => navigate(`/contests/${contestId}`)}
        >
          ← 콘테스트 상세로
        </button>
      </div>
    </div>
  );
};

export default ContestAccessBlock;
