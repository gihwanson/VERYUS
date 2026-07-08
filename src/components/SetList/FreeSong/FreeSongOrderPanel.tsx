import React from 'react';
import type { SetListData } from '../types';
import { useFreeSongLineup } from './useFreeSongLineup';
import { canCompleteLineupItem, filterIncompleteLineup } from './freeSongStatsUtils';
import { FreeSongEmptyState, SongRow } from './FreeSongShared';

interface FreeSongOrderPanelProps {
  activeSetList: SetListData | null;
  userNickname: string;
  canManage: boolean;
}

const FreeSongOrderPanel: React.FC<FreeSongOrderPanelProps> = ({
  activeSetList,
  userNickname,
  canManage,
}) => {
  const { actionLoading, completeLineupItem, moveLineupItem, removeFromLineup, normalizeLineup } =
    useFreeSongLineup(activeSetList?.id);
  const lineup = normalizeLineup(activeSetList?.freeSongLineup);
  const pendingLineup = filterIncompleteLineup(lineup);
  const completedCount = lineup.length - pendingLineup.length;

  if (!activeSetList) {
    return (
      <FreeSongEmptyState
        title="활성 버스킹 세션이 없습니다."
        subtitle="관리자가 세션을 준비하면 진행 순서를 확인할 수 있습니다."
      />
    );
  }

  const handleComplete = async (submissionId: string, title: string) => {
    if (!confirm(`"${title}" 무대를 완료 처리하시겠습니까?\n완료 시 참여 멤버 통계에 반영되며, 전송한 멤버가 다시 곡을 전송할 수 있습니다.`)) return;
    await completeLineupItem(
      submissionId,
      lineup,
      userNickname,
      activeSetList.freeSongSubmissions
    );
  };

  const handleRemove = async (submissionId: string) => {
    if (!confirm('이 곡을 진행 순서에서 제거하시겠습니까?\n제거 시 전송한 멤버가 다시 곡을 전송할 수 있습니다.')) return;
    await removeFromLineup(submissionId, lineup, activeSetList.freeSongSubmissions);
  };

  const pendingIndexMap = new Map(pendingLineup.map((item, index) => [item.submissionId, index]));

  return (
    <div className="free-song-panel">
      <div className="setlist-manage-panel">
        <h2 className="setlist-manage-heading free-song-heading">진행 순서</h2>
        <p className="setlist-manage-sub free-song-desc">
          오늘 자유곡 버스킹 진행 순서입니다. 무대가 끝나면 <strong>완료</strong> 버튼을 눌러 주세요.
          {canManage && pendingLineup.length > 1 && ' 순서는 ↑↓ 버튼으로 변경할 수 있습니다.'}
          {completedCount > 0 && (
            <span className="free-song-admin-count"> · {completedCount}곡 완료</span>
          )}
        </p>
      </div>

      <div className="setlist-manage-panel">
        {lineup.length === 0 ? (
          <p className="free-song-empty-sub">아직 확정된 자유곡 순서가 없습니다. 곡 선정 탭에서 곡을 추가하세요.</p>
        ) : (
          <div className="free-song-list free-song-list--order">
            {lineup.map((item, index) => {
              const isCompleted = Boolean(item.completedAt);
              const showComplete = canCompleteLineupItem(item, userNickname, canManage);
              const pendingIndex = pendingIndexMap.get(item.submissionId);

              const orderActions =
                canManage && !isCompleted && pendingIndex != null ? (
                  <>
                    <button
                      type="button"
                      className="free-song-btn free-song-btn--ghost"
                      disabled={actionLoading || pendingIndex === 0}
                      onClick={() => moveLineupItem(item.submissionId, 'up', lineup)}
                      aria-label="위로"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="free-song-btn free-song-btn--ghost"
                      disabled={actionLoading || pendingIndex === pendingLineup.length - 1}
                      onClick={() => moveLineupItem(item.submissionId, 'down', lineup)}
                      aria-label="아래로"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="free-song-btn free-song-btn--cancel"
                      disabled={actionLoading}
                      onClick={() => handleRemove(item.submissionId)}
                    >
                      제거
                    </button>
                  </>
                ) : null;

              const completeAction = showComplete ? (
                <button
                  type="button"
                  className="free-song-btn free-song-btn--complete"
                  disabled={actionLoading}
                  onClick={() => handleComplete(item.submissionId, item.title)}
                >
                  완료
                </button>
              ) : isCompleted ? (
                <span className="free-song-complete-label">완료됨</span>
              ) : null;

              const action =
                orderActions || completeAction ? (
                  <div className="free-song-row__actions">
                    {orderActions}
                    {completeAction}
                  </div>
                ) : undefined;

              return (
                <SongRow
                  key={item.submissionId}
                  order={index + 1}
                  title={item.title}
                  members={item.members}
                  submittedBy={item.submittedBy}
                  badge={isCompleted ? '완료' : undefined}
                  action={action}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default FreeSongOrderPanel;
