import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { ParticipantRecord, SongRequestRecord } from '../types/contest';
import {
  dedupeContestParticipants,
  isRegisteredParticipant,
  isSongRequestPerformer,
  normalizeNickname,
  parseParticipantFromDoc,
} from '../utils/contestParticipant';
import {
  buildSongRequestLineup,
  filterSongRequestPerformers,
  findPerformerParticipantDoc,
  selectSongRequest,
  subscribeMySongRequests,
  subscribeSongRequestsForTarget,
  upsertSongRequest,
} from '../utils/contestSongRequest';

interface Props {
  contestId: string;
  contestTitle: string;
  isStarted: boolean;
  ended?: boolean;
  user: { uid: string; nickname?: string; role?: string };
  /** 있으면 페이지 이동 대신 닫기(홈 모달 등) */
  onClose?: () => void;
  /** 모달 안에 넣을 때 전체 화면 높이/바깥 패딩을 줄인다 */
  embedded?: boolean;
}

const ContestSongRequestView: React.FC<Props> = ({
  contestId,
  contestTitle,
  isStarted,
  ended = false,
  user,
  onClose,
  embedded = false,
}) => {
  const navigate = useNavigate();
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [incoming, setIncoming] = useState<SongRequestRecord[]>([]);
  const [myRequests, setMyRequests] = useState<SongRequestRecord[]>([]);
  const [performerDocId, setPerformerDocId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitles, setDraftTitles] = useState<Record<string, string>>({});
  const [savingTargetUid, setSavingTargetUid] = useState<string | null>(null);
  const [savingSelection, setSavingSelection] = useState(false);
  const [message, setMessage] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingCompletedUid, setEditingCompletedUid] = useState<string | null>(null);

  const uniqueParticipants = useMemo(
    () => dedupeContestParticipants(participants),
    [participants]
  );

  const performerParticipants = useMemo(
    () => filterSongRequestPerformers(uniqueParticipants),
    [uniqueParticipants]
  );

  const isPerformer = useMemo(
    () => isRegisteredParticipant(performerParticipants, user),
    [performerParticipants, user]
  );

  const locked = isStarted || ended;
  const lineup = useMemo(
    () => buildSongRequestLineup(uniqueParticipants),
    [uniqueParticipants]
  );

  const requestableTargets = useMemo(
    () =>
      performerParticipants.filter((p) => {
        if (!isSongRequestPerformer(p)) return false;
        if (p.uid === user.uid) return false;
        if (!user.nickname) return true;
        return normalizeNickname(p.nickname) !== normalizeNickname(user.nickname);
      }),
    [performerParticipants, user]
  );

  const myRequestByTarget = useMemo(() => {
    const map = new Map<string, SongRequestRecord>();
    for (const req of myRequests) {
      map.set(req.targetUid, req);
    }
    return map;
  }, [myRequests]);

  const pendingTargets = useMemo(
    () => requestableTargets.filter((p) => !myRequestByTarget.has(p.uid)),
    [requestableTargets, myRequestByTarget]
  );

  const completedTargets = useMemo(
    () => requestableTargets.filter((p) => myRequestByTarget.has(p.uid)),
    [requestableTargets, myRequestByTarget]
  );

  useEffect(() => {
    if (!contestId) return;
    return onSnapshot(collection(db, 'contests', contestId, 'participants'), (snap) => {
      setParticipants(
        snap.docs.map((d) => parseParticipantFromDoc(d.id, d.data() as Record<string, unknown>))
      );
    });
  }, [contestId]);

  useEffect(() => {
    if (!contestId || !user?.uid || !isPerformer) {
      setPerformerDocId(null);
      setIncoming([]);
      return;
    }
    let unsubIncoming: (() => void) | undefined;
    let cancelled = false;
    void findPerformerParticipantDoc(contestId, user).then((found) => {
      if (cancelled || !found) {
        setPerformerDocId(null);
        return;
      }
      setPerformerDocId(found.docId);
      setSelectedId(found.participant.selectedSongRequestId || null);
      unsubIncoming = subscribeSongRequestsForTarget(contestId, found.participant.uid, setIncoming);
    });
    return () => {
      cancelled = true;
      unsubIncoming?.();
    };
  }, [contestId, user, isPerformer]);

  useEffect(() => {
    if (!contestId || !user?.uid) {
      setMyRequests([]);
      return;
    }
    return subscribeMySongRequests(contestId, user.uid, setMyRequests);
  }, [contestId, user?.uid]);

  useEffect(() => {
    if (myRequests.length === 0) return;
    setDraftTitles((prev) => {
      const next = { ...prev };
      for (const req of myRequests) {
        if (!next[req.targetUid]) {
          next[req.targetUid] = req.songTitle;
        }
      }
      return next;
    });
  }, [myRequests]);

  const handleSubmitRequest = useCallback(
    async (targetUid: string) => {
      if (locked) {
        setMessage('개최된 뒤에는 신청곡을 넣을 수 없습니다.');
        return;
      }
      const target = uniqueParticipants.find((p) => p.uid === targetUid);
      if (!target) {
        setMessage('출연자를 찾을 수 없습니다.');
        return;
      }
      if (!user.nickname?.trim()) {
        setMessage('닉네임이 없어 신청할 수 없습니다.');
        return;
      }
      const songTitle = (draftTitles[targetUid] || '').trim();
      if (!songTitle) {
        setMessage('곡명을 입력해주세요.');
        return;
      }
      const wasEdit = myRequestByTarget.has(targetUid);
      setSavingTargetUid(targetUid);
      setMessage('');
      try {
        await upsertSongRequest({
          contestId,
          targetUid: target.uid,
          targetNickname: target.nickname,
          requesterUid: user.uid,
          requesterNickname: user.nickname,
          songTitle,
        });
        setEditingCompletedUid(null);
        setMessage(
          wasEdit
            ? `${target.nickname}님 신청곡을 「${songTitle}」으로 수정했습니다.`
            : `${target.nickname}님에게 「${songTitle}」을(를) 신청했습니다.`
        );
      } catch (error) {
        console.error(error);
        setMessage(error instanceof Error ? error.message : '신청에 실패했습니다.');
      } finally {
        setSavingTargetUid(null);
      }
    },
    [locked, uniqueParticipants, user, draftTitles, contestId, myRequestByTarget]
  );

  const handleSelectSong = useCallback(async () => {
    if (locked) {
      setMessage('개최된 뒤에는 곡을 바꿀 수 없습니다.');
      return;
    }
    if (!performerDocId || !selectedId) {
      setMessage('부를 신청곡을 선택해주세요.');
      return;
    }
    const picked = incoming.find((r) => r.id === selectedId);
    if (!picked) {
      setMessage('선택한 신청곡을 찾을 수 없습니다.');
      return;
    }
    setSavingSelection(true);
    setMessage('');
    try {
      await selectSongRequest({
        contestId,
        participantDocId: performerDocId,
        requestId: picked.id,
        songTitle: picked.songTitle,
      });
      setMessage(`「${picked.songTitle}」을(를) 선택했습니다.`);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : '선택에 실패했습니다.');
    } finally {
      setSavingSelection(false);
    }
  }, [locked, performerDocId, selectedId, incoming, contestId]);

  return (
    <div
      className="contest-ui-refresh contest-participate-refresh"
      style={
        embedded
          ? { padding: 0, minHeight: 0 }
          : { minHeight: '100vh', padding: 16 }
      }
    >
      {!embedded && (
        <button
          type="button"
          className="contest-back-button"
          onClick={() => (onClose ? onClose() : navigate(`/contests/${contestId}`))}
        >
          {onClose ? '← 닫기' : '← 상세로'}
        </button>
      )}

      {embedded ? (
        <p style={{ margin: '0 0 8px', color: 'var(--paper-muted, #8b7355)', fontSize: 13 }}>
          {locked
            ? '개최되어 신청·선택이 마감되었습니다. 확정 곡을 확인할 수 있습니다.'
            : '출연자마다 신청곡을 넣을 수 있습니다. 신청 완료한 항목은 아래에서 수정할 수 있습니다.'}
        </p>
      ) : (
        <div className="contest-detail-summary-card" style={{ marginTop: 12 }}>
          <h2 className="contest-detail-title">{contestTitle}</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--paper-muted, #8b7355)', fontSize: 14 }}>
            {locked
              ? '개최되어 신청·선택이 마감되었습니다. 확정 곡을 확인할 수 있습니다.'
              : '출연자마다 신청곡을 넣을 수 있습니다. 같은 출연자에게 다시 넣으면 덮어씁니다.'}
          </p>
        </div>
      )}

      {isStarted && (
        <section className="contest-detail-section" style={{ marginTop: 16 }}>
          <h3 className="contest-section-label">확정 신청곡</h3>
          {lineup.length === 0 ? (
            <p style={{ color: '#8b7355' }}>등록된 출연자가 없습니다.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lineup.map((entry) => (
                <li
                  key={entry.uid}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--paper-border, #e8dcc8)',
                    background: 'var(--paper-card, #fffdf8)',
                  }}
                >
                  <strong>{entry.nickname}</strong>
                  <div style={{ marginTop: 4, fontSize: 15 }}>
                    {entry.selectedSongTitle || '미선택'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isPerformer && (
        <section className="contest-detail-section" style={{ marginTop: 16 }}>
          <h3 className="contest-section-label">받은 신청곡 ({incoming.length})</h3>
          <p style={{ marginTop: 0, marginBottom: 10, fontSize: 13, color: '#8b7355' }}>
            아래에서 부를 곡을 하나 고르세요.
          </p>
          {incoming.length === 0 ? (
            <p style={{ color: '#8b7355' }}>아직 받은 신청곡이 없습니다.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {incoming.map((req) => (
                <label
                  key={req.id}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    padding: '12px 14px',
                    borderRadius: 8,
                    border:
                      selectedId === req.id
                        ? '2px solid var(--paper-accent, #8b5a2b)'
                        : '1px solid var(--paper-border, #e8dcc8)',
                    background: 'var(--paper-card, #fffdf8)',
                    cursor: locked ? 'default' : 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="song-request-pick"
                    checked={selectedId === req.id}
                    disabled={locked}
                    onChange={() => setSelectedId(req.id)}
                    style={{ marginTop: 4 }}
                  />
                  <span>
                    <strong>{req.songTitle}</strong>
                    <div style={{ fontSize: 13, color: '#8b7355', marginTop: 2 }}>
                      신청: {req.requesterNickname}
                    </div>
                  </span>
                </label>
              ))}
            </div>
          )}
          {!locked && (
            <button
              type="button"
              className="contest-button participate"
              style={{ marginTop: 12 }}
              disabled={savingSelection || !selectedId}
              onClick={() => void handleSelectSong()}
            >
              {savingSelection ? '저장 중...' : '이 곡으로 선택'}
            </button>
          )}
        </section>
      )}

      <section className="contest-detail-section" style={{ marginTop: 16 }}>
        <h3 className="contest-section-label">
          신청할 출연자
          {pendingTargets.length > 0 ? ` (${pendingTargets.length})` : ''}
        </h3>
        <p style={{ marginTop: 0, marginBottom: 12, fontSize: 13, color: '#8b7355' }}>
          신청이 끝나면 목록에서 빠집니다. 완료한 신청은 아래에서 다시 수정할 수 있습니다.
        </p>
        {requestableTargets.length === 0 ? (
          <p style={{ color: '#8b7355' }}>
            {uniqueParticipants.length === 0
              ? '신청할 출연자가 아직 없습니다. 리더가 출연자를 등록할 때까지 기다려 주세요.'
              : '신청할 다른 출연자가 없습니다.'}
          </p>
        ) : pendingTargets.length === 0 ? (
          <p style={{ color: '#8b7355' }}>모든 출연자에게 신청을 마쳤습니다.</p>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              maxHeight: 280,
              overflowY: 'auto',
              paddingRight: 2,
            }}
          >
            {pendingTargets.map((target) => {
              const draft = draftTitles[target.uid] ?? '';
              const saving = savingTargetUid === target.uid;
              return (
                <div
                  key={target.uid}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--paper-border, #e8dcc8)',
                    background: 'var(--paper-card, #fffdf8)',
                  }}
                >
                  <strong style={{ fontSize: 14 }}>{target.nickname}</strong>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    <input
                      className="contest-input"
                      value={draft}
                      disabled={locked}
                      onChange={(e) =>
                        setDraftTitles((prev) => ({ ...prev, [target.uid]: e.target.value }))
                      }
                      placeholder="곡명"
                      maxLength={80}
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    {!locked && (
                      <button
                        type="button"
                        className="contest-button participate"
                        style={{ flexShrink: 0, padding: '8px 12px' }}
                        disabled={saving || !draft.trim()}
                        onClick={() => void handleSubmitRequest(target.uid)}
                      >
                        {saving ? '...' : '신청'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {completedTargets.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              onClick={() => {
                setShowCompleted((prev) => !prev);
                if (showCompleted) setEditingCompletedUid(null);
              }}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--paper-border, #e8dcc8)',
                background: 'var(--paper-tag-bg, #f0e6d6)',
                cursor: 'pointer',
                font: 'inherit',
                color: 'inherit',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                신청 완료 {completedTargets.length}명
              </span>
              <span style={{ fontSize: 13, color: '#8b7355' }}>
                {showCompleted ? '접기' : '수정하려면 펼치기'}
              </span>
            </button>

            {showCompleted && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {completedTargets.map((target) => {
                  const existing = myRequestByTarget.get(target.uid);
                  const isEditing = editingCompletedUid === target.uid;
                  const draft =
                    draftTitles[target.uid] ?? existing?.songTitle ?? '';
                  const saving = savingTargetUid === target.uid;
                  return (
                    <div
                      key={target.uid}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--paper-border, #e8dcc8)',
                        background: 'var(--paper-card, #fffdf8)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 8,
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ fontSize: 14 }}>{target.nickname}</strong>
                          {!isEditing && (
                            <div
                              style={{
                                marginTop: 2,
                                fontSize: 13,
                                color: '#4a3f32',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {existing?.songTitle}
                            </div>
                          )}
                        </div>
                        {!locked && !isEditing && (
                          <button
                            type="button"
                            className="contest-button detail"
                            style={{ flexShrink: 0, padding: '6px 10px', fontSize: 13 }}
                            onClick={() => {
                              setEditingCompletedUid(target.uid);
                              setDraftTitles((prev) => ({
                                ...prev,
                                [target.uid]: existing?.songTitle || prev[target.uid] || '',
                              }));
                            }}
                          >
                            수정
                          </button>
                        )}
                      </div>
                      {isEditing && !locked && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                          <input
                            className="contest-input"
                            value={draft}
                            onChange={(e) =>
                              setDraftTitles((prev) => ({
                                ...prev,
                                [target.uid]: e.target.value,
                              }))
                            }
                            placeholder="곡명"
                            maxLength={80}
                            style={{ flex: 1, minWidth: 0 }}
                          />
                          <button
                            type="button"
                            className="contest-button participate"
                            style={{ flexShrink: 0, padding: '8px 12px' }}
                            disabled={saving || !draft.trim()}
                            onClick={() => void handleSubmitRequest(target.uid)}
                          >
                            {saving ? '...' : '저장'}
                          </button>
                          <button
                            type="button"
                            className="contest-button detail"
                            style={{ flexShrink: 0, padding: '8px 10px' }}
                            disabled={saving}
                            onClick={() => setEditingCompletedUid(null)}
                          >
                            취소
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {message && (
        <p style={{ marginTop: 16, color: 'var(--paper-ink, #2c2416)', fontWeight: 600 }}>{message}</p>
      )}
    </div>
  );
};

export default ContestSongRequestView;
