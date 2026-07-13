import React, { useState } from 'react';
import type { SetListData } from '../types';
import type { FreeSongSubmissionsState } from './useFreeSongSubmissions';
import { useFreeSongLineup } from './useFreeSongLineup';
import type { FreeSongSubmission } from './types';
import { FreeSongEmptyState, SongRow } from './FreeSongShared';

interface FreeSongAdminPanelProps {
  activeSetList: SetListData | null;
  submissionsState: FreeSongSubmissionsState;
  userNickname: string;
  userUid?: string;
  userRole?: string | null;
}

const FreeSongAdminPanel: React.FC<FreeSongAdminPanelProps> = ({
  activeSetList,
  submissionsState,
  userNickname,
  userUid,
  userRole,
}) => {
  const { activeSubmissions, loading, actionLoading: submitActionLoading, rejectSubmission } = submissionsState;
  const { actionLoading: lineupActionLoading, addToLineup, normalizeLineup } = useFreeSongLineup(
    activeSetList?.id,
    activeSetList,
    { uid: userUid, nickname: userNickname, role: userRole }
  );

  const [pendingRejectId, setPendingRejectId] = useState<string | null>(null);
  const actionLoading = submitActionLoading || lineupActionLoading;
  const lineup = normalizeLineup(activeSetList?.freeSongLineup);
  const lineupSubmissionIds = new Set(lineup.map((item) => item.submissionId));
  const pendingSubmissions = activeSubmissions.filter((sub) => !lineupSubmissionIds.has(sub.id));

  if (!activeSetList) {
    return (
      <FreeSongEmptyState
        title="활성 버스킹 세션이 없습니다."
        subtitle="리더·조장이 버스킹 페이지에 접속하면 세션이 자동으로 준비됩니다."
      />
    );
  }

  if (loading) {
    return <FreeSongEmptyState title="자유곡 목록 불러오는 중…" />;
  }

  const groupedPending = pendingSubmissions.reduce<Record<string, FreeSongSubmission[]>>((acc, sub) => {
    if (!acc[sub.submittedBy]) acc[sub.submittedBy] = [];
    acc[sub.submittedBy].push(sub);
    return acc;
  }, {});

  const handleAdd = async (submission: FreeSongSubmission) => {
    setPendingRejectId(null);
    const ok = await addToLineup(submission, lineup);
    if (ok === 'busy') return;
    if (ok === false) {
      // already-added alert is handled inside addToLineup for MUTATION_REJECTED;
      // network failures stay silent only when already covered — show fallback if needed
    }
  };

  const handleRejectSubmission = async (submission: FreeSongSubmission) => {
    if (actionLoading) return;
    if (pendingRejectId !== submission.id) {
      setPendingRejectId(submission.id);
      return;
    }
    setPendingRejectId(null);
    await rejectSubmission(submission, userNickname);
  };

  return (
    <div className="free-song-panel">
      <div className="setlist-manage-panel">
        <h2 className="setlist-manage-heading free-song-heading">곡 선정</h2>
        <p className="setlist-manage-sub free-song-desc">
          전송된 합격곡 중 버스킹에 사용할 곡을 선택하세요. 순서 변경은 <strong>진행 순서</strong> 탭에서 할 수 있습니다.
          {activeSubmissions.length > 0 && (
            <span className="free-song-admin-count"> · 총 {activeSubmissions.length}곡 전송됨</span>
          )}
        </p>
      </div>

      <div className="setlist-manage-panel">
        <h3 className="free-song-section-title">전송 목록 ({pendingSubmissions.length})</h3>
        {pendingSubmissions.length === 0 ? (
          <p className="free-song-empty-sub">
            {activeSubmissions.length === 0
              ? '아직 전송된 곡이 없습니다. 사용자가 자유곡 · 곡 전송 탭에서 합격곡을 내면 여기에 표시됩니다.'
              : '모든 전송 곡이 진행 순서에 추가되었습니다.'}
          </p>
        ) : (
          Object.entries(groupedPending)
            .sort(([a], [b]) => a.localeCompare(b, 'ko'))
            .map(([nickname, userSubs]) => (
              <div key={nickname} className="free-song-user-group">
                <h4 className="free-song-user-name">{nickname}</h4>
                <div className="free-song-list">
                  {userSubs.map((sub) => {
                    const confirmingReject = pendingRejectId === sub.id;
                    return (
                      <SongRow
                        key={sub.id}
                        title={sub.title}
                        members={sub.members}
                        badge="전송됨"
                        badgeVariant="submitted"
                        action={
                          <div className="free-song-row__actions free-song-row__actions--admin">
                            <button
                              type="button"
                              className="free-song-btn free-song-btn--submit"
                              disabled={actionLoading}
                              onClick={() => void handleAdd(sub)}
                            >
                              선택
                            </button>
                            {confirmingReject ? (
                              <>
                                <button
                                  type="button"
                                  className="free-song-btn free-song-btn--cancel"
                                  disabled={actionLoading}
                                  onClick={() => void handleRejectSubmission(sub)}
                                >
                                  거부 확인
                                </button>
                                <button
                                  type="button"
                                  className="free-song-btn free-song-btn--ghost"
                                  disabled={actionLoading}
                                  onClick={() => setPendingRejectId(null)}
                                >
                                  취소
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="free-song-btn free-song-btn--cancel free-song-btn--secondary-danger"
                                disabled={actionLoading}
                                onClick={() => void handleRejectSubmission(sub)}
                              >
                                거부
                              </button>
                            )}
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
};

export default FreeSongAdminPanel;
