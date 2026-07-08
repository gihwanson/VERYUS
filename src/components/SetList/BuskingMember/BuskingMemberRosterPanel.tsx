import React, { useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { SetListData } from '../types';
import { getBuskingParticipants } from './buskingParticipantsUtils';
import BuskingMemberPickerModal from './BuskingMemberPickerModal';

interface BuskingMemberRosterPanelProps {
  activeSetList: SetListData | null;
  canManage: boolean;
  variant: 'freeSong' | 'setlist';
  sessionTitleLabel?: string;
}

const BuskingMemberRosterPanel: React.FC<BuskingMemberRosterPanelProps> = ({
  activeSetList,
  canManage,
  variant,
  sessionTitleLabel,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const participants = getBuskingParticipants(activeSetList);

  const saveParticipants = async (next: string[]) => {
    if (!activeSetList?.id || !canManage) return false;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id), {
        participants: next,
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      console.error('참가 멤버 저장 실패:', error);
      alert('멤버 편성 저장에 실패했습니다.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmModal = async (selected: string[]) => {
    const ok = await saveParticipants(selected);
    if (ok) setModalOpen(false);
  };

  const handleRemove = async (nickname: string) => {
    if (!canManage) return;
    if (!confirm(`${nickname}님을 참가 멤버에서 제거할까요?`)) return;
    const next = participants.filter((p) => p !== nickname);
    await saveParticipants(next);
  };

  if (!activeSetList) {
    return (
      <div className="setlist-manage-panel free-song-panel">
        <p className="free-song-empty">활성 버스킹 세션이 없습니다.</p>
      </div>
    );
  }

  const heading = variant === 'freeSong' ? '멤버 편성' : '참가 멤버 편성';
  const description =
    variant === 'freeSong'
      ? '버스킹에 참가하는 멤버를 지정합니다. 편성된 멤버만 자유곡 합격곡을 전송할 수 있습니다.'
      : '셋리스트 진행에 참가할 멤버를 선택하세요. 멤버 편성을 바꿔도 등록한 곡은 유지됩니다.';

  return (
    <div className="free-song-panel">
      <div className="setlist-manage-panel">
        <h2 className="setlist-manage-heading free-song-heading">
          {heading}
          {sessionTitleLabel && (
            <span className="free-song-admin-count"> · {sessionTitleLabel}</span>
          )}
        </h2>
        <p className="setlist-manage-sub free-song-desc">{description}</p>
        {canManage && (
          <button
            type="button"
            className="free-song-btn free-song-btn--submit busking-roster-add-btn"
            disabled={saving}
            onClick={() => setModalOpen(true)}
          >
            + 멤버 선택
          </button>
        )}
      </div>

      <div className="setlist-manage-panel">
        <h3 className="free-song-section-title">참가 멤버 ({participants.length})</h3>
        {participants.length === 0 ? (
          <p className="free-song-empty-sub">
            {canManage
              ? '「멤버 선택」 버튼으로 참가 인원을 추가해 주세요.'
              : '아직 참가 멤버가 편성되지 않았습니다.'}
          </p>
        ) : (
          <div className="busking-roster-chips">
            {participants.map((nickname) => (
              <span key={nickname} className="busking-roster-chip">
                {nickname}
                {canManage && (
                  <button
                    type="button"
                    className="busking-roster-chip__remove"
                    onClick={() => handleRemove(nickname)}
                    disabled={saving}
                    aria-label={`${nickname} 제거`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      <BuskingMemberPickerModal
        open={modalOpen}
        initialSelected={participants}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirmModal}
        title="버스킹 참가 멤버 선택"
      />
    </div>
  );
};

export default BuskingMemberRosterPanel;
