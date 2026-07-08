import React from 'react';
import { FreeSongEmptyState } from './FreeSong/FreeSongShared';

interface BuskingBootstrapGateProps {
  bootstrapping: boolean;
  bootstrapError: string | null;
  activeSetList: unknown;
  canManage: boolean;
  onRetry?: () => void;
  children: React.ReactNode;
}

const BuskingBootstrapGate: React.FC<BuskingBootstrapGateProps> = ({
  bootstrapping,
  bootstrapError,
  activeSetList,
  canManage,
  onRetry,
  children,
}) => {
  if (bootstrapping && canManage && !activeSetList) {
    return <FreeSongEmptyState title="버스킹 세션 준비 중…" />;
  }

  if (bootstrapError && canManage && !activeSetList) {
    return (
      <div className="setlist-manage-panel free-song-panel">
        <p className="free-song-empty">버스킹 세션을 준비하지 못했습니다.</p>
        <p className="free-song-empty-sub">{bootstrapError}</p>
        {onRetry && (
          <button type="button" className="free-song-btn free-song-btn--submit" style={{ marginTop: 12 }} onClick={onRetry}>
            다시 시도
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
};

export default BuskingBootstrapGate;
