import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { X } from 'lucide-react';
import { db } from '../firebase';
import type { ParticipantRecord, SongRequestParticipationRole, SongRequestRecord } from '../types/contest';
import {
  dedupeContestParticipants,
  isSongRequestAudience,
  normalizeNickname,
  parseParticipantFromDoc,
} from '../utils/contestParticipant';
import {
  filterSongRequestPerformers,
  findPerformerParticipantDoc,
  joinSongRequestContest,
  leaveSongRequestContest,
  selectSongRequest,
  subscribeActiveSongRequestContest,
  subscribeMySongRequests,
  subscribeSongRequestsForTarget,
  upsertSongRequest,
  type ActiveSongRequestContest,
} from '../utils/contestSongRequest';
import './ContestSongRequestBubble.css';

type HomeUser = {
  uid: string;
  nickname?: string;
  role?: string;
};

function withNim(nickname: string): string {
  const name = nickname.trim();
  if (!name) return name;
  return name.endsWith('님') ? name : `${name}님`;
}

function withoutNim(nickname: string): string {
  const name = nickname.trim();
  return name.endsWith('님') ? name.slice(0, -1) : name;
}

const ContestSongRequestBubble: React.FC<{ user: HomeUser | null }> = ({ user }) => {
  const [contest, setContest] = useState<ActiveSongRequestContest | null>(null);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [myRequests, setMyRequests] = useState<SongRequestRecord[]>([]);
  const [incoming, setIncoming] = useState<SongRequestRecord[]>([]);
  const [performerDocId, setPerformerDocId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingSelection, setSavingSelection] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [focusUid, setFocusUid] = useState<string | null>(null);
  const [songTitle, setSongTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [joining, setJoining] = useState<SongRequestParticipationRole | 'cancel' | null>(null);
  const [pendingRoleAction, setPendingRoleAction] = useState<
    SongRequestParticipationRole | 'cancel' | null
  >(null);
  const [message, setMessage] = useState('');
  const [spotlightUid, setSpotlightUid] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setContest(null);
      setLoading(false);
      setShowModal(false);
      return;
    }
    setLoading(true);
    return subscribeActiveSongRequestContest(
      (next) => {
        setContest(next);
        setLoading(false);
        if (!next) setShowModal(false);
      },
      () => {
        setContest(null);
        setLoading(false);
        setShowModal(false);
      }
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!contest?.id) {
      setParticipants([]);
      return;
    }
    return onSnapshot(collection(db, 'contests', contest.id, 'participants'), (snap) => {
      setParticipants(
        snap.docs.map((d) => parseParticipantFromDoc(d.id, d.data() as Record<string, unknown>))
      );
    });
  }, [contest?.id]);

  useEffect(() => {
    if (!contest?.id || !user?.uid) {
      setMyRequests([]);
      return;
    }
    return subscribeMySongRequests(contest.id, user.uid, setMyRequests);
  }, [contest?.id, user?.uid]);

  const uniqueParticipants = useMemo(
    () => dedupeContestParticipants(participants),
    [participants]
  );

  const myParticipation = useMemo(() => {
    if (!user) return null;
    const userNick = normalizeNickname(user.nickname || '');
    return (
      uniqueParticipants.find(
        (p) =>
          p.uid === user.uid ||
          (userNick && normalizeNickname(p.nickname) === userNick)
      ) || null
    );
  }, [uniqueParticipants, user]);

  const myRole: SongRequestParticipationRole | null = myParticipation
    ? isSongRequestAudience(myParticipation)
      ? '관객'
      : '출연자'
    : null;

  useEffect(() => {
    if (!contest?.id || !user?.uid || myRole !== '출연자') {
      setIncoming([]);
      setPerformerDocId(null);
      return;
    }
    const contestId = contest.id;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void findPerformerParticipantDoc(contestId, user).then((found) => {
      if (cancelled) return;
      if (!found) {
        setPerformerDocId(null);
        setIncoming([]);
        return;
      }
      setPerformerDocId(found.docId);
      unsub = subscribeSongRequestsForTarget(contestId, found.participant.uid, setIncoming);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [contest?.id, user, myRole]);

  useEffect(() => {
    if (myRole !== '출연자') {
      setSelectedId(null);
      return;
    }
    setSelectedId(myParticipation?.selectedSongRequestId || null);
  }, [myRole, myParticipation?.selectedSongRequestId]);

  const performers = useMemo(
    () => filterSongRequestPerformers(uniqueParticipants),
    [uniqueParticipants]
  );

  const requestableTargets = useMemo(() => {
    return performers.filter((p) => {
      if (!user) return true;
      if (p.uid === user.uid) return false;
      if (!user.nickname) return true;
      return normalizeNickname(p.nickname) !== normalizeNickname(user.nickname);
    });
  }, [performers, user]);

  const myRequestByTarget = useMemo(() => {
    const map = new Map<string, SongRequestRecord>();
    for (const req of myRequests) map.set(req.targetUid, req);
    return map;
  }, [myRequests]);

  const pendingTargets = useMemo(
    () => requestableTargets.filter((p) => !myRequestByTarget.has(p.uid)),
    [requestableTargets, myRequestByTarget]
  );

  // 홈에 들어올 때마다 신청 대상 출연자를 한 명 고른다. 같은 방문에서는 그 사람이 목록에 있는 동안 유지한다.
  const spotlightStillValid =
    spotlightUid !== null && requestableTargets.some((p) => p.uid === spotlightUid);
  if (!spotlightStillValid) {
    if (requestableTargets.length === 0) {
      if (spotlightUid !== null) setSpotlightUid(null);
    } else {
      const next =
        requestableTargets[Math.floor(Math.random() * requestableTargets.length)].uid;
      setSpotlightUid(next);
    }
  }

  const featured = useMemo(() => {
    if (focusUid) {
      const picked = requestableTargets.find((p) => p.uid === focusUid);
      if (picked) return picked;
    }
    if (spotlightUid) {
      return requestableTargets.find((p) => p.uid === spotlightUid) || null;
    }
    return null;
  }, [focusUid, spotlightUid, requestableTargets]);

  const locked = Boolean(contest?.isStarted || contest?.ended);
  const canJoin = Boolean(contest && !contest.ended);

  const deadlineText = useMemo(() => {
    if (!contest?.deadline?.seconds) return '';
    return new Date(contest.deadline.seconds * 1000).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
    });
  }, [contest?.deadline?.seconds]);

  useEffect(() => {
    if (!featured) {
      setSongTitle('');
      return;
    }
    const existing = myRequestByTarget.get(featured.uid);
    setSongTitle(existing?.songTitle || '');
  }, [featured?.uid, myRequestByTarget]);

  const handleJoin = useCallback(
    async (role: SongRequestParticipationRole) => {
      if (!contest || !user?.uid || myRole === role) return;
      if (locked) {
        setMessage('개최된 뒤에는 역할을 바꿀 수 없습니다.');
        return;
      }
      setJoining(role);
      setMessage('');
      setPendingRoleAction(null);
      try {
        await joinSongRequestContest({
          contestId: contest.id,
          user,
          role,
        });
        setMessage(
          myRole
            ? `${role}로 변경했습니다.`
            : role === '출연자'
              ? '출연자로 참여했습니다. 이제 신청곡을 받을 수 있습니다.'
              : '관객으로 참여했습니다. 출연자에게 신청곡을 넣어보세요.'
        );
      } catch (error) {
        console.error(error);
        setMessage(error instanceof Error ? error.message : '참여에 실패했습니다.');
      } finally {
        setJoining(null);
      }
    },
    [contest, user, myRole, locked]
  );

  const handleLeave = useCallback(async () => {
    if (!contest || !user?.uid) return;
    if (locked) {
      setMessage('개최된 뒤에는 참여를 취소할 수 없습니다.');
      return;
    }
    setJoining('cancel');
    setMessage('');
    setPendingRoleAction(null);
    try {
      await leaveSongRequestContest({ contestId: contest.id, user });
      setMessage('참여를 취소했습니다. 출연자 또는 관객으로 다시 선택해 주세요.');
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : '참여 취소에 실패했습니다.');
    } finally {
      setJoining(null);
    }
  }, [contest, user, locked]);

  const handleSelectSong = useCallback(async () => {
    if (!contest || locked) {
      setMessage('개최된 뒤에는 곡을 바꿀 수 없습니다.');
      return;
    }
    if (!performerDocId || !selectedId) {
      setMessage('부를 신청곡을 선택해주세요.');
      return;
    }
    const picked = incoming.find((req) => req.id === selectedId);
    if (!picked) {
      setMessage('선택한 신청곡을 찾을 수 없습니다.');
      return;
    }
    setSavingSelection(true);
    setMessage('');
    try {
      await selectSongRequest({
        contestId: contest.id,
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
  }, [contest, locked, performerDocId, selectedId, incoming]);

  const handleSubmit = useCallback(async () => {
    if (!contest || !user?.uid || !user.nickname?.trim() || !featured) return;
    if (locked) {
      setMessage('개최된 뒤에는 신청곡을 넣을 수 없습니다.');
      return;
    }
    const title = songTitle.trim();
    if (!title) {
      setMessage('곡명을 입력해주세요.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      if (!myRole && canJoin) {
        await joinSongRequestContest({ contestId: contest.id, user, role: '관객' });
      }
      await upsertSongRequest({
        contestId: contest.id,
        targetUid: featured.uid,
        targetNickname: featured.nickname,
        requesterUid: user.uid,
        requesterNickname: user.nickname,
        songTitle: title,
      });
      const nextPending = pendingTargets.find((p) => p.uid !== featured.uid);
      if (nextPending) {
        setMessage(`${withNim(featured.nickname)}에게 신청했습니다. 다음 출연자에게도 넣어볼까요?`);
        setFocusUid(nextPending.uid);
      } else {
        setMessage(`${withNim(featured.nickname)}에게 신청했습니다.`);
      }
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : '신청에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }, [contest, user, featured, locked, songTitle, pendingTargets, myRole, canJoin]);

  if (!user?.uid || loading || !contest) return null;

  const existingForFeatured = featured ? myRequestByTarget.get(featured.uid) : undefined;
  const bubbleMainText = featured
    ? `${withNim(featured.nickname)}에게 신청하고 싶은 곡`
    : '출연자·관객으로 참여하기';

  const modal =
    showModal &&
    createPortal(
      <div
        className="song-request-modal-overlay"
        onClick={() => {
          setShowModal(false);
          setPendingRoleAction(null);
        }}
        role="presentation"
      >
        <div
          className="song-request-modal song-request-modal--compact"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="song-request-modal-title"
        >
          <div className="song-request-modal__hero">
            <div className="song-request-modal__hero-top">
              <div>
                <span className="song-request-bubble__label">신청곡</span>
                <h3 id="song-request-modal-title" className="song-request-modal__title">
                  {featured
                    ? `${withNim(featured.nickname)}에게 신청하고 싶은 곡`
                    : contest.title}
                </h3>
                <p className="song-request-modal__sub">
                  {contest.title}
                  {deadlineText ? ` · ~${deadlineText}` : ''}
                  {myRole ? ` · ${myRole}로 참여 중` : ''}
                </p>
              </div>
              <button
                type="button"
                className="song-request-modal__close"
                onClick={() => {
                  setShowModal(false);
                  setPendingRoleAction(null);
                }}
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="song-request-modal__body">
            {myRole === '출연자' && (
              <section className="song-request-modal__inbox" aria-label="받은 신청곡">
                <p className="song-request-modal__inbox-label">
                  받은 신청곡 {incoming.length}곡
                </p>
                {myParticipation?.selectedSongTitle ? (
                  <p className="song-request-modal__inbox-picked">
                    고른 곡 · {myParticipation.selectedSongTitle}
                  </p>
                ) : (
                  <p className="song-request-modal__inbox-picked">아직 부를 곡을 고르지 않았습니다.</p>
                )}
                {incoming.length === 0 ? (
                  <p className="song-request-modal__inbox-empty">아직 받은 신청곡이 없습니다.</p>
                ) : (
                  <div className="song-request-modal__inbox-list" role="radiogroup" aria-label="받은 신청곡">
                    {incoming.map((req) => {
                      const picked = selectedId === req.id;
                      return (
                        <button
                          key={req.id}
                          type="button"
                          role="radio"
                          aria-checked={picked}
                          className={`song-request-modal__inbox-item${picked ? ' is-selected' : ''}`}
                          disabled={locked}
                          onClick={() => {
                            setSelectedId(req.id);
                            setMessage('');
                          }}
                        >
                          <span className="song-request-modal__inbox-title">{req.songTitle}</span>
                          <span className="song-request-modal__inbox-from">
                            신청자: {withoutNim(req.requesterNickname)}
                            {picked ? ' · 선택' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {!locked && incoming.length > 0 && (
                  <button
                    type="button"
                    className="contest-button participate song-request-modal__inbox-save"
                    disabled={savingSelection || !selectedId}
                    onClick={() => void handleSelectSong()}
                  >
                    {savingSelection ? '저장 중...' : '이 곡으로 선택'}
                  </button>
                )}
              </section>
            )}

            {canJoin && (
              <div className="song-request-modal__join">
                <p className="song-request-modal__join-label">
                  {myRole ? `현재 ${myRole}` : '어떻게 참여할까요?'}
                </p>
                <div className="song-request-modal__join-actions">
                  <button
                    type="button"
                    className={`song-request-modal__join-btn${myRole === '출연자' ? ' is-active' : ''}`}
                    disabled={Boolean(joining) || locked || myRole === '출연자'}
                    onClick={() => {
                      if (myRole) setPendingRoleAction('출연자');
                      else void handleJoin('출연자');
                    }}
                  >
                    {joining === '출연자'
                      ? myRole
                        ? '변경 중...'
                        : '등록 중...'
                      : myRole === '출연자'
                        ? '출연자 참여 중'
                        : myRole
                          ? '출연자로 변경'
                          : '출연자로 참여'}
                  </button>
                  <button
                    type="button"
                    className={`song-request-modal__join-btn song-request-modal__join-btn--audience${myRole === '관객' ? ' is-active' : ''}`}
                    disabled={Boolean(joining) || locked || myRole === '관객'}
                    onClick={() => {
                      if (myRole) setPendingRoleAction('관객');
                      else void handleJoin('관객');
                    }}
                  >
                    {joining === '관객'
                      ? myRole
                        ? '변경 중...'
                        : '등록 중...'
                      : myRole === '관객'
                        ? '관객 참여 중'
                        : myRole
                          ? '관객으로 변경'
                          : '관객으로 참여'}
                  </button>
                </div>
                {myRole && !locked && (
                  <button
                    type="button"
                    className="song-request-modal__cancel"
                    disabled={Boolean(joining)}
                    onClick={() => setPendingRoleAction('cancel')}
                  >
                    참여 취소하고 다시 선택
                  </button>
                )}
                {pendingRoleAction && (
                  <div className="song-request-modal__confirm">
                    <p>
                      {pendingRoleAction === 'cancel'
                        ? '참여를 취소하면 출연자와 관객 중에서 다시 고를 수 있습니다.'
                        : pendingRoleAction === '출연자'
                          ? '관객 참여를 취소하고 출연자로 바꿀까요?'
                          : '출연자 참여를 취소하고 관객으로 바꿀까요? 신청곡을 받는 명단에서는 빠집니다.'}
                    </p>
                    <div className="song-request-modal__confirm-actions">
                      <button
                        type="button"
                        className="song-request-modal__confirm-btn"
                        disabled={Boolean(joining)}
                        onClick={() => {
                          if (pendingRoleAction === 'cancel') void handleLeave();
                          else void handleJoin(pendingRoleAction);
                        }}
                      >
                        {joining
                          ? '처리 중...'
                          : pendingRoleAction === 'cancel'
                            ? '취소하기'
                            : '바꾸기'}
                      </button>
                      <button
                        type="button"
                        className="song-request-modal__confirm-btn song-request-modal__confirm-btn--ghost"
                        disabled={Boolean(joining)}
                        onClick={() => setPendingRoleAction(null)}
                      >
                        돌아가기
                      </button>
                    </div>
                  </div>
                )}
                <p className="song-request-modal__join-hint">
                  {locked
                    ? '개최된 뒤에는 역할을 바꿀 수 없습니다.'
                    : myRole
                      ? '역할을 잘못 골랐다면 다른 쪽을 누르거나, 참여를 취소한 뒤 다시 선택할 수 있습니다.'
                      : '출연자로 참여하면 다른 멤버에게 신청곡을 받을 수 있습니다.'}
                </p>
              </div>
            )}

            {featured ? (
              <>
                {requestableTargets.length > 1 && (
                  <div className="song-request-modal__chips" role="list">
                    {requestableTargets.map((p) => {
                      const done = myRequestByTarget.has(p.uid);
                      const active = p.uid === featured.uid;
                      return (
                        <button
                          key={p.uid}
                          type="button"
                          role="listitem"
                          className={`song-request-modal__chip${active ? ' is-active' : ''}${done ? ' is-done' : ''}`}
                          onClick={() => {
                            setFocusUid(p.uid);
                            setMessage('');
                          }}
                        >
                          {withNim(p.nickname)}
                          {done ? ' ✓' : ''}
                        </button>
                      );
                    })}
                  </div>
                )}

                <label className="song-request-modal__field-label" htmlFor="song-request-home-title">
                  곡명
                </label>
                <input
                  id="song-request-home-title"
                  className="contest-input song-request-modal__input"
                  value={songTitle}
                  disabled={locked || saving}
                  onChange={(e) => setSongTitle(e.target.value)}
                  placeholder={`${withNim(featured.nickname)}에게 신청할 곡`}
                  maxLength={80}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void handleSubmit();
                    }
                  }}
                />

                {!locked && (
                  <button
                    type="button"
                    className="contest-button participate song-request-modal__submit"
                    disabled={saving || !songTitle.trim()}
                    onClick={() => void handleSubmit()}
                  >
                    {saving ? '제출 중...' : existingForFeatured ? '수정해서 제출' : '신청하기'}
                  </button>
                )}

                {locked && (
                  <p className="song-request-modal__locked">개최되어 신청이 마감되었습니다.</p>
                )}
              </>
            ) : (
              <p className="song-request-modal__locked">
                아직 출연자가 없습니다. 먼저 출연자로 참여해 주세요.
              </p>
            )}

            {message && <p className="song-request-modal__message">{message}</p>}
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <>
      <button
        type="button"
        className="song-request-bubble"
        onClick={() => {
          setMessage('');
          if (featured) setFocusUid(featured.uid);
          setShowModal(true);
        }}
        aria-label={featured ? `${withNim(featured.nickname)}에게 신청곡 넣기` : '신청곡 참여하기'}
      >
        <div className="song-request-bubble__content">
          <span className="song-request-bubble__label">신청곡</span>
          <span className="song-request-bubble__text">{bubbleMainText}</span>
          <span className="song-request-bubble__hint">
            {contest.title}
            {deadlineText ? ` · ~${deadlineText}` : ''}
            {featured
              ? existingForFeatured
                ? ' · 탭해서 수정'
                : ' · 탭해서 신청'
              : ' · 탭해서 참여'}
          </span>
        </div>
        <div className="song-request-bubble__tail" aria-hidden />
      </button>
      {modal}
    </>
  );
};

export default ContestSongRequestBubble;
