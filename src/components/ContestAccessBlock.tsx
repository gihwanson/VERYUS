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
    <div
      className="contest-ui-refresh"
      style={{
        minHeight: '100vh',
        background: 'var(--app-page-gradient)',
        backgroundAttachment: 'fixed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: 'rgba(244, 63, 94, 0.85)',
          backdropFilter: 'blur(15px)',
          borderRadius: 20,
          padding: '40px 32px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          textAlign: 'center',
          maxWidth: 400,
          width: '100%',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
        <div style={{ color: 'white', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{title}</div>
        <div
          style={{
            color: 'rgba(255, 255, 255, 0.95)',
            fontSize: 16,
            lineHeight: 1.6,
            marginBottom: 24,
            whiteSpace: 'pre-line',
          }}
        >
          {message}
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate(`/contests/${contestId}`)}
        >
          ← 콘테스트 상세로
        </button>
      </div>
    </div>
  );
};

export default ContestAccessBlock;
