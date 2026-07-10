import React, { useState } from 'react';
import { doc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { SetListData } from './types';
import type { BuskingCategory } from './BuskingNav';
import BuskingSessionBar from './BuskingSessionBar';
import BuskingSessionPickerModal, { BuskingSessionCreateModal } from './BuskingSessionPickerModal';
import { FreeSongEmptyState } from './FreeSong/FreeSongShared';
import type { BuskingSessionUser } from './buskingSessionPermissions';
import { canHostBuskingSession } from './buskingSessionPermissions';

interface BuskingSessionShellProps {
  category: BuskingCategory;
  activeSetList: SetListData | null;
  liveSessionsToday: SetListData[];
  needsSessionPicker: boolean;
  awaitingVenue: boolean;
  bootstrapping: boolean;
  bootstrapError: string | null;
  user: BuskingSessionUser | null;
  canManageCurrent: boolean;
  setSelectedSessionId: (id: string | null) => void;
  onCreateSession: (venueLabel: string, category: BuskingCategory) => Promise<string | false>;
  onRetryBootstrap?: () => void;
  children: React.ReactNode;
}

const BuskingSessionShell: React.FC<BuskingSessionShellProps> = ({
  category,
  activeSetList,
  liveSessionsToday,
  needsSessionPicker,
  awaitingVenue,
  bootstrapping,
  bootstrapError,
  user,
  canManageCurrent,
  setSelectedSessionId,
  onCreateSession,
  onRetryBootstrap,
  children,
}) => {
  const [showCreate, setShowCreate] = useState(false);
  const canHost = canHostBuskingSession(user);

  const handleEndSession = async () => {
    if (!activeSetList?.id || !canManageCurrent) return;
    if (!confirm('이 버스킹을 종료할까요? 종료 후에는 새로 열어야 합니다.')) return;
    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id), {
        status: 'ended',
        isActive: false,
        isCompleted: true,
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      setSelectedSessionId(null);
    } catch (e) {
      console.error('버스킹 종료 실패:', e);
      alert('버스킹 종료에 실패했습니다.');
    }
  };

  const handleCreate = async (venueLabel: string) => {
    const sessionId = await onCreateSession(venueLabel, category);
    if (sessionId) {
      setSelectedSessionId(sessionId);
      setShowCreate(false);
    }
  };

  return (
    <>
      <BuskingSessionBar
        category={category}
        activeSetList={activeSetList}
        liveSessionsToday={liveSessionsToday}
        user={user}
        onSelectSession={setSelectedSessionId}
        onOpenCreate={() => setShowCreate(true)}
        onEndSession={canManageCurrent ? handleEndSession : undefined}
      />

      <BuskingSessionPickerModal
        open={needsSessionPicker}
        sessions={liveSessionsToday}
        onSelect={setSelectedSessionId}
      />

      <BuskingSessionCreateModal
        open={awaitingVenue || showCreate}
        bootstrapping={bootstrapping}
        error={bootstrapError}
        onConfirm={handleCreate}
        onClose={
          awaitingVenue && !canHost
            ? undefined
            : () => {
                if (!awaitingVenue) setShowCreate(false);
              }
        }
      />

      {bootstrapping && canHost && !activeSetList && !awaitingVenue && !showCreate ? (
        <FreeSongEmptyState title="버스킹 세션 준비 중…" />
      ) : bootstrapError && canHost && !activeSetList && !awaitingVenue ? (
        <div className="setlist-manage-panel free-song-panel">
          <p className="free-song-empty">버스킹 세션을 준비하지 못했습니다.</p>
          <p className="free-song-empty-sub">{bootstrapError}</p>
          {onRetryBootstrap && (
            <button type="button" className="free-song-btn free-song-btn--submit" style={{ marginTop: 12 }} onClick={onRetryBootstrap}>
              다시 시도
            </button>
          )}
        </div>
      ) : !activeSetList && !needsSessionPicker && !awaitingVenue && !showCreate && !canHost ? (
        <FreeSongEmptyState
          title={category === 'setlist' ? '참가 중인 셋리스트가 없습니다.' : '참가 중인 버스킹이 없습니다.'}
          subtitle={
            category === 'setlist'
              ? '위에서 버스킹을 선택하거나, 관리자가 셋리스트를 편성하면 이곳에 표시됩니다.'
              : '조장이 버스킹을 열면 여기서 곡 전송·진행 순서를 확인할 수 있습니다.'
          }
        />
      ) : !activeSetList && !needsSessionPicker && !awaitingVenue && !showCreate && canHost ? (
        <div className="setlist-manage-panel free-song-panel">
          <p className="free-song-empty">
            {category === 'setlist'
              ? '진행 중인 셋리스트 세션이 없습니다.'
              : '진행 중인 내 버스킹이 없습니다.'}
          </p>
          <p className="free-song-empty-sub">
            {category === 'setlist'
              ? '「+ 새 버스킹 열기」로 셋리스트 전용 세션을 시작하세요.'
              : '「+ 새 버스킹 열기」로 현장을 등록하고 시작하세요.'}
          </p>
          <button
            type="button"
            className="free-song-btn free-song-btn--submit"
            style={{ marginTop: 12 }}
            onClick={() => setShowCreate(true)}
          >
            + 새 버스킹 열기
          </button>
        </div>
      ) : activeSetList ? (
        children
      ) : null}
    </>
  );
};

export default BuskingSessionShell;
