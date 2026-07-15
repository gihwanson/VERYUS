import React, { useState } from 'react';
import type { SetListData } from '../types';
import type { FreeSongSubmissionsState } from './useFreeSongSubmissions';
import type { FreeSongSubmission } from './types';
import type { ApprovedSong } from '../../ApprovedSongsUtils';
import { FreeSongEmptyState, SongRow } from './FreeSongShared';
import FreeSongSubmitModal from './FreeSongSubmitModal';

interface FreeSongPanelProps {
  activeSetList: SetListData | null;
  userNickname: string;
  userUid: string;
  submissionsState: FreeSongSubmissionsState;
}

const FreeSongPanel: React.FC<FreeSongPanelProps> = ({
  activeSetList,
  userNickname,
  userUid,
  submissionsState,
}) => {
  const {
    mySubmissions,
    myRejectedSubmissions,
    quotaSubmissionCount,
    submissionLimit,
    canSubmitMore,
    isLeader,
    partnerSubmittedSongs,
    availableSongs,
    eligibleApprovedSongs,
    approvedSongs,
    lineupSubmissionIds,
    canAccessSubmit,
    participants,
    loading,
    actionLoading,
    submitSong,
    cancelSubmission,
    dismissRejectedSubmission,
  } = submissionsState;

  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);

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

  const handleSubmit = async (song: ApprovedSong): Promise<boolean> => {
    if (!canSubmitMore) {
      alert(`최대 ${submissionLimit}곡까지 전송할 수 있습니다. 본인 전송·파트너 전송 곡을 합쳐 집계됩니다.`);
      return false;
    }
    const partnerEntry = partnerSubmittedSongs.find((item) => item.song.id === song.id);
    if (partnerEntry) {
      alert('파트너가 이미 전송을 했습니다.');
      return false;
    }
    const ok = await submitSong(song, userUid);
    if (ok) {
      if (!isLeader && quotaSubmissionCount + 1 >= submissionLimit) {
        setSubmitModalOpen(false);
      }
      return true;
    }
    return false;
  };

  const handleCancel = async (submission: FreeSongSubmission, asPartner = false) => {
    if (actionLoading) return;
    if (pendingCancelId !== submission.id) {
      setPendingCancelId(submission.id);
      return;
    }
    setPendingCancelId(null);
    await cancelSubmission(submission, userUid, asPartner ? { actorNickname: userNickname } : undefined);
  };

  const handleDismissRejected = async (submission: FreeSongSubmission) => {
    await dismissRejectedSubmission(submission.id, userUid);
  };

  if (participants.length === 0) {
    return (
      <div className="free-song-panel">
        <div className="setlist-manage-panel">
          <h2 className="setlist-manage-heading free-song-heading">곡 전송</h2>
          <p className="free-song-empty-sub">
            아직 참가 멤버가 편성되지 않았습니다. 관리자가 <strong>멤버 편성</strong> 탭에서 참가 인원을 추가하면 전송할 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  if (!canAccessSubmit) {
    return (
      <div className="free-song-panel">
        <div className="setlist-manage-panel">
          <h2 className="setlist-manage-heading free-song-heading">곡 전송</h2>
          <p className="free-song-empty-sub">
            이번 버스킹 참가 멤버가 아니어서 합격곡을 전송할 수 없습니다.
          </p>
          <p className="free-song-desc" style={{ marginTop: 12 }}>
            참가 멤버: {participants.join(', ')}
          </p>
          <p className="free-song-desc" style={{ marginTop: 8 }}>
            조장에게 멤버 편성에 본인 닉네임({userNickname.trim() || '미확인'})이 포함되었는지 확인해 주세요.
          </p>
        </div>
      </div>
    );
  }

  const renderCancelActions = (submission: FreeSongSubmission, asPartner = false) => {
    if (lineupSubmissionIds.has(submission.id)) return undefined;
    const confirming = pendingCancelId === submission.id;
    if (confirming) {
      return (
        <div className="free-song-row__actions">
          <button
            type="button"
            className="free-song-btn free-song-btn--cancel"
            disabled={actionLoading}
            onClick={() => void handleCancel(submission, asPartner)}
          >
            취소 확인
          </button>
          <button
            type="button"
            className="free-song-btn free-song-btn--ghost"
            disabled={actionLoading}
            onClick={() => setPendingCancelId(null)}
          >
            닫기
          </button>
        </div>
      );
    }
    return (
      <button
        type="button"
        className="free-song-btn free-song-btn--cancel"
        disabled={actionLoading}
        onClick={() => void handleCancel(submission, asPartner)}
      >
        전송취소
      </button>
    );
  };

  const quotaExemptPartnerSongs = partnerSubmittedSongs.filter(({ submission }) => submission.quotaExempt);
  const quotaCountingPartnerSongs = partnerSubmittedSongs.filter(({ submission }) => !submission.quotaExempt);

  return (
    <div className="free-song-panel">
      <div className="setlist-manage-panel">
        <div className="free-song-submit-header">
          <h2 className="setlist-manage-heading free-song-heading">곡 전송</h2>
          {isLeader ? (
            <span className="free-song-submission-quota">제한 없음</span>
          ) : (
            <span className={`free-song-submission-quota${!canSubmitMore ? ' free-song-submission-quota--full' : ''}`}>
              {quotaSubmissionCount}/{submissionLimit}
            </span>
          )}
        </div>
        <p className="setlist-manage-sub free-song-desc">
          {isLeader
            ? '리더는 참가 멤버의 합격곡을 제한 없이 전송할 수 있습니다. 리더가 대신 전송한 곡은 해당 멤버의 3곡 한도에 포함되지 않습니다.'
            : `참가 멤버로 편성되어 합격곡을 전송할 수 있습니다. 최대 ${submissionLimit}곡까지 전송 가능하며, 파트너가 전송한 곡도 한도에 포함됩니다.`}
        </p>
        <p className="free-song-desc" style={{ marginTop: 12, marginBottom: 12 }}>
          {isLeader ? `전송 가능 합격곡 ${eligibleApprovedSongs.length}곡` : `내 합격곡 ${approvedSongs.length}곡`}
        </p>
        {availableSongs.length === 0 ? (
          <p className="free-song-empty-sub">
            {!canSubmitMore
              ? `전송 한도(${submissionLimit}곡)에 도달했습니다. 본인 전송·파트너 전송 곡을 합쳐 집계됩니다.`
              : approvedSongs.length === 0
                ? isLeader
                  ? '참가 멤버의 합격곡이 없습니다.'
                  : '본인이 멤버로 등록된 합격곡이 없습니다.'
                : eligibleApprovedSongs.length === 0
                  ? '합격곡 멤버 전원이 참가 멤버에 포함된 곡만 전송할 수 있습니다.'
                  : mySubmissions.length > 0 || partnerSubmittedSongs.length > 0
                    ? '전송 가능한 합격곡을 모두 전송했습니다.'
                    : '전송할 수 있는 합격곡이 없습니다.'}
          </p>
        ) : (
          <button
            type="button"
            className="free-song-btn free-song-btn--submit"
            disabled={actionLoading || !canSubmitMore}
            onClick={() => {
              setPendingCancelId(null);
              setSubmitModalOpen(true);
            }}
          >
            합격곡 선택하여 전송
          </button>
        )}
      </div>

      {(mySubmissions.length > 0 || myRejectedSubmissions.length > 0) && (
        <div className="setlist-manage-panel">
          <h3 className="free-song-section-title">내 전송 현황 ({mySubmissions.length + myRejectedSubmissions.length})</h3>
          <div className="free-song-list">
            {mySubmissions.map((sub) => (
              <SongRow
                key={sub.id}
                title={sub.title}
                members={sub.members}
                badge={
                  lineupSubmissionIds.has(sub.id)
                    ? '선정됨'
                    : sub.quotaExempt
                      ? '리더 전송'
                      : '전송됨'
                }
                badgeVariant={lineupSubmissionIds.has(sub.id) ? 'selected' : 'submitted'}
                action={renderCancelActions(sub)}
              />
            ))}
            {myRejectedSubmissions.map((sub) => (
              <SongRow
                key={sub.id}
                title={sub.title}
                members={sub.members}
                badge="거부됨"
                badgeVariant="rejected"
                action={
                  <div className="free-song-row__actions">
                    <button
                      type="button"
                      className="free-song-btn free-song-btn--ghost"
                      disabled={actionLoading}
                      onClick={() => void handleDismissRejected(sub)}
                    >
                      알림삭제
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        </div>
      )}

      {quotaCountingPartnerSongs.length > 0 && (
        <div className="setlist-manage-panel">
          <h3 className="free-song-section-title">파트너 전송 완료 ({quotaCountingPartnerSongs.length})</h3>
          <p className="free-song-desc" style={{ marginBottom: 12 }}>
            파트너가 이미 전송한 합격곡은 중복 전송할 수 없으며, 전송 한도에도 포함됩니다.
          </p>
          <div className="free-song-list">
            {quotaCountingPartnerSongs.map(({ song, submission }) => (
              <SongRow
                key={song.id}
                title={song.title}
                members={song.members}
                submittedBy={submission.submittedBy}
                badge="파트너 전송됨"
                badgeVariant="submitted"
                action={renderCancelActions(submission, true)}
              />
            ))}
          </div>
        </div>
      )}

      {quotaExemptPartnerSongs.length > 0 && (
        <div className="setlist-manage-panel">
          <h3 className="free-song-section-title">리더 대리 전송 ({quotaExemptPartnerSongs.length})</h3>
          <p className="free-song-desc" style={{ marginBottom: 12 }}>
            리더가 대신 전송한 곡입니다. 중복 전송은 불가하지만, 내 3곡 한도에는 포함되지 않습니다.
          </p>
          <div className="free-song-list">
            {quotaExemptPartnerSongs.map(({ song, submission }) => (
              <SongRow
                key={song.id}
                title={song.title}
                members={song.members}
                submittedBy={submission.submittedBy}
                badge="리더 전송"
                badgeVariant="submitted"
                action={renderCancelActions(submission, true)}
              />
            ))}
          </div>
        </div>
      )}

      <FreeSongSubmitModal
        open={submitModalOpen}
        songs={availableSongs}
        totalApprovedCount={isLeader ? eligibleApprovedSongs.length : approvedSongs.length}
        quotaSubmissionCount={quotaSubmissionCount}
        submissionLimit={submissionLimit}
        unlimitedQuota={isLeader}
        canSubmitMore={canSubmitMore}
        actionLoading={actionLoading}
        onClose={() => setSubmitModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
};

export default FreeSongPanel;
