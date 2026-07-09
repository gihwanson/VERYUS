import React from 'react';
import type { SetListData } from '../types';
import type { FreeSongSubmissionsState } from './useFreeSongSubmissions';
import type { FreeSongSubmission } from './types';
import type { ApprovedSong } from '../../ApprovedSongsUtils';
import { FreeSongEmptyState, SongRow } from './FreeSongShared';

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
    mySubmissionCount,
    quotaSubmissionCount,
    submissionLimit,
    canSubmitMore,
    partnerSubmittedSongs,
    availableSongs,
    eligibleApprovedSongs,
    approvedSongs,
    lineupSubmissionIds,
    isParticipant,
    participants,
    loading,
    actionLoading,
    submitSong,
    cancelSubmission,
    dismissRejectedSubmission,
  } = submissionsState;

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

  const handleSubmit = async (song: ApprovedSong) => {
    if (!canSubmitMore) {
      alert(`최대 ${submissionLimit}곡까지 전송할 수 있습니다. 본인 전송·파트너 전송 곡을 합쳐 집계됩니다.`);
      return;
    }
    const partnerEntry = partnerSubmittedSongs.find((item) => item.song.id === song.id);
    if (partnerEntry) {
      alert('파트너가 이미 전송을 했습니다.');
      return;
    }
    if (!confirm(`"${song.title}"을(를) 관리자에게 전송하시겠습니까?`)) return;
    const ok = await submitSong(song, userUid);
    if (ok) {
      alert(`"${song.title}" 전송이 완료되었습니다.`);
    }
  };

  const handleCancel = async (submission: FreeSongSubmission, asPartner = false) => {
    await cancelSubmission(submission, userUid, asPartner ? { actorNickname: userNickname } : undefined);
  };

  const handleDismissRejected = async (submission: FreeSongSubmission) => {
    if (!confirm(`"${submission.title}" 거부 알림을 삭제하시겠습니까?`)) return;
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

  if (!isParticipant) {
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

  return (
    <div className="free-song-panel">
      <div className="setlist-manage-panel">
        <div className="free-song-submit-header">
          <h2 className="setlist-manage-heading free-song-heading">곡 전송</h2>
          <span className={`free-song-submission-quota${!canSubmitMore ? ' free-song-submission-quota--full' : ''}`}>
            {quotaSubmissionCount}/{submissionLimit}
          </span>
        </div>
        <p className="setlist-manage-sub free-song-desc">
          참가 멤버로 편성되어 합격곡을 전송할 수 있습니다. 최대 {submissionLimit}곡까지 전송 가능하며, 파트너가 전송한 곡도 한도에 포함됩니다.
        </p>
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
                badge={lineupSubmissionIds.has(sub.id) ? '선정됨' : '전송됨'}
                badgeVariant={lineupSubmissionIds.has(sub.id) ? 'selected' : 'submitted'}
                action={
                  lineupSubmissionIds.has(sub.id) ? (
                    undefined
                  ) : (
                    <button
                      type="button"
                      className="free-song-btn free-song-btn--cancel"
                      disabled={actionLoading}
                      onClick={() => handleCancel(sub)}
                    >
                    전송취소
                    </button>
                  )
                }
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
                      onClick={() => handleDismissRejected(sub)}
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

      {partnerSubmittedSongs.length > 0 && (
        <div className="setlist-manage-panel">
          <h3 className="free-song-section-title">파트너 전송 완료 ({partnerSubmittedSongs.length})</h3>
          <p className="free-song-desc" style={{ marginBottom: 12 }}>
            파트너가 이미 전송한 합격곡은 중복 전송할 수 없으며, 전송 한도에도 포함됩니다.
          </p>
          <div className="free-song-list">
            {partnerSubmittedSongs.map(({ song, submission }) => (
              <SongRow
                key={song.id}
                title={song.title}
                members={song.members}
                submittedBy={submission.submittedBy}
                badge="파트너 전송됨"
                badgeVariant="submitted"
                action={
                  lineupSubmissionIds.has(submission.id) ? (
                    undefined
                  ) : (
                    <button
                      type="button"
                      className="free-song-btn free-song-btn--cancel"
                      disabled={actionLoading}
                      onClick={() => handleCancel(submission, true)}
                    >
                      전송취소
                    </button>
                  )
                }
              />
            ))}
          </div>
        </div>
      )}

      <div className="setlist-manage-panel">
        <h3 className="free-song-section-title">합격곡 전송</h3>
        {availableSongs.length === 0 ? (
          <p className="free-song-empty-sub">
            {!canSubmitMore
              ? `전송 한도(${submissionLimit}곡)에 도달했습니다. 본인 전송·파트너 전송 곡을 합쳐 집계됩니다.`
              : approvedSongs.length === 0
                ? '본인이 멤버로 등록된 합격곡이 없습니다.'
                : eligibleApprovedSongs.length === 0
                  ? '합격곡 멤버 전원이 참가 멤버에 포함된 곡만 전송할 수 있습니다.'
                  : mySubmissions.length > 0 || partnerSubmittedSongs.length > 0
                    ? '전송 가능한 합격곡을 모두 전송했습니다.'
                    : '전송할 수 있는 합격곡이 없습니다.'}
          </p>
        ) : (
          <div className="free-song-list">
            {availableSongs.map((song) => (
              <SongRow
                key={song.id}
                title={song.title}
                members={song.members}
                action={
                  <button
                    type="button"
                    className="free-song-btn free-song-btn--submit"
                    disabled={actionLoading || !canSubmitMore}
                    onClick={() => handleSubmit(song)}
                  >
                    전송
                  </button>
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FreeSongPanel;
