import React, { useMemo } from 'react';
import type { SetListData } from '../types';
import { getFreeSongParticipants } from '../BuskingMember/buskingParticipantsUtils';
import { useFreeSongLineup, useGlobalFreeSongStats } from './useFreeSongLineup';
import { buildRosterSessionStats, computeStatsFromLineup } from './freeSongStatsUtils';
import { FreeSongEmptyState } from './FreeSongShared';

interface FreeSongStatsPanelProps {
  activeSetList: SetListData | null;
  canManage?: boolean;
  userUid?: string;
  userNickname?: string;
  userRole?: string | null;
}

const FreeSongStatsPanel: React.FC<FreeSongStatsPanelProps> = ({
  activeSetList,
  canManage = false,
  userUid,
  userNickname,
  userRole,
}) => {
  const { globalStats, loading: globalLoading } = useGlobalFreeSongStats();
  const { actionLoading, resetSessionStats } = useFreeSongLineup(activeSetList?.id, activeSetList, {
    uid: userUid,
    nickname: userNickname,
    role: userRole,
  });

  const completedStats = useMemo(
    () => computeStatsFromLineup(activeSetList?.freeSongLineup),
    [activeSetList?.freeSongLineup]
  );

  const rosterSessionStats = useMemo(() => {
    const participants = getFreeSongParticipants(activeSetList);
    return buildRosterSessionStats(participants, completedStats);
  }, [activeSetList, completedStats]);

  const hasSessionStats = rosterSessionStats.some(([, count]) => count > 0);

  const handleResetSession = async () => {
    const ok = await resetSessionStats(activeSetList?.freeSongLineup);
    if (ok) alert('이번 세션 통계가 초기화되었습니다.');
  };

  if (!activeSetList) {
    return (
      <FreeSongEmptyState
        title="활성 버스킹 세션이 없습니다."
        subtitle="세션이 시작되면 통계를 확인할 수 있습니다."
      />
    );
  }

  if (globalLoading) {
    return <FreeSongEmptyState title="통계 불러오는 중…" />;
  }

  const participants = getFreeSongParticipants(activeSetList);

  return (
    <div className="free-song-panel">
      <div className="setlist-manage-panel">
        <h2 className="setlist-manage-heading free-song-heading">통계</h2>
        <p className="setlist-manage-sub free-song-desc">
          진행 순서에서 <strong>완료</strong> 처리된 곡이 통계에 반영됩니다. 듀엣·합창은 참여 멤버 각각 1곡으로 집계됩니다.
        </p>
      </div>

      <div className="setlist-manage-panel">
        <div className="free-song-stats-header">
          <h3 className="free-song-section-title">이번 세션 · 참여 멤버</h3>
          {canManage && (
            <button
              type="button"
              className="free-song-btn free-song-btn--reset"
              disabled={actionLoading || !hasSessionStats}
              onClick={handleResetSession}
            >
              세션 초기화
            </button>
          )}
        </div>
        <p className="free-song-desc free-song-desc--admin">
          버스킹에 편성된 멤버별 완료 곡 수입니다.
        </p>
        {participants.length === 0 ? (
          <p className="free-song-empty-sub">아직 참가 멤버가 편성되지 않았습니다.</p>
        ) : (
          <div className="free-song-stats-list">
            {rosterSessionStats.map(([nickname, count], index) => (
              <div key={nickname} className="free-song-stats-row">
                <span className="free-song-stats-rank">{index + 1}</span>
                <span className="free-song-stats-name">{nickname}</span>
                <span className="free-song-stats-count">{count}곡</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="setlist-manage-panel">
        <h3 className="free-song-section-title">전체 누적</h3>
        <p className="free-song-desc free-song-desc--admin">
          지금까지 자유곡 버스킹에서 완료한 누적 곡 수입니다.
        </p>
        {Object.keys(globalStats).length === 0 ? (
          <p className="free-song-empty-sub">아직 누적 통계가 없습니다.</p>
        ) : (
          <div className="free-song-stats-list">
            {buildRosterSessionStats(
              Object.keys(globalStats),
              globalStats
            ).map(([nickname, count], index) => (
              <div key={nickname} className="free-song-stats-row">
                <span className="free-song-stats-rank">{index + 1}</span>
                <span className="free-song-stats-name">{nickname}</span>
                <span className="free-song-stats-count">{count}곡</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FreeSongStatsPanel;
