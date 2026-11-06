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
  joinSongRequestContest,
  subscribeActiveSongRequestContest,
  subscribeMySongRequests,
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

const ContestSongRequestBubble: React.FC<{ user: HomeUser | null }> = ({ user }) => {
  const [contest, setContest] = useState<ActiveSongRequestContest | null>(null);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [myRequests, setMyRequests] = useState<SongRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [focusUid, setFocusUid] = useState<string | null>(null);
  const [songTitle, setSongTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [joining, setJoining] = useState<SongRequestParticipationRole | null>(null);
  const [message, setMessage] = useState('');

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

  const featured = useMemo(() => {
    if (focusUid) {
      const picked = requestableTargets.find((p) => p.uid === focusUid);
      if (picked) return picked;
    }
    return pendingTargets[0] || requestableTargets[0] || null;
  }, [focusUid, pendingTargets, requestableTargets]);

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
      if (!contest || !user?.uid) return;
      setJoining(role);
      setMessage('');
      try {
        await joinSongRequestContest({
          contestId: contest.id,
          user,
          role,
        });
        setMessage(
          role === '출연자'
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
    [contest, user]
  );

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
        onClick={() => setShowModal(false)}
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
                onClick={() => setShowModal(false)}
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="song-request-modal__body">
            {canJoin && (
              <div className="song-request-modal__join">
                <p className="song-request-modal__join-label">
                  {myRole ? `현재 ${myRole}` : '어떻게 참여할까요?'}
                </p>
                <div className="song-request-modal__join-actions">
                  <button
                    type="button"
                    className={`song-request-modal__join-btn${myRole === '출연자' ? ' is-active' : ''}`}
                    disabled={Boolean(joining) || myRole === '출연자'}
                    onClick={() => void handleJoin('출연자')}
                  >
                    {joining === '출연자'
                      ? '등록 중...'
                      : myRole === '출연자'
                        ? '출연자 참여 완료'
                        : '출연자로 참여'}
                  </button>
                  <button
                    type="button"
                    className={`song-request-modal__join-btn song-request-modal__join-btn--audience${myRole === '관객' ? ' is-active' : ''}`}
                    disabled={Boolean(joining) || myRole === '관객' || myRole === '출연자'}
                    onClick={() => void handleJoin('관객')}
                  >
                    {joining === '관객'
                      ? '등록 중...'
                      : myRole === '관객'
                        ? '관객 참여 완료'
                        : myRole === '출연자'
                          ? '출연자로 참여 중'
                          : '관객으로 참여'}
                  </button>
                </div>
                <p className="song-request-modal__join-hint">
                  출연자로 참여하면 다른 멤버에게 신청곡을 받을 수 있습니다.
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
