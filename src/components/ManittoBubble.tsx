import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gift, X } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  adminAddManittoParticipant,
  adminClearManittoDraw,
  adminRemoveManittoParticipant,
  adminSwapManittoReceiver,
  archiveManittoSeason,
  closeManittoRecruiting,
  createManittoSeason,
  drawManittoSeason,
  joinManittoSeason,
  leaveManittoSeason,
  subscribeActiveManittoSeason,
  subscribeManittoAssignmentRows,
  subscribeManittoParticipant,
  subscribeManittoParticipantCount,
  subscribeManittoParticipants,
  subscribeMyManittoAssignment,
} from '../utils/manittoService';
import { fetchWorldCupMemberOptions } from '../utils/memberWorldCupService';
import {
  MANITTO_MIN_PARTICIPANTS,
  MANITTO_STATUS_LABEL,
  type ManittoAssignment,
  type ManittoAssignmentRow,
  type ManittoParticipant,
  type ManittoSeason,
} from '../utils/manittoTypes';
import './Manitto.css';

type HomeUser = {
  uid: string;
  nickname?: string;
  role?: string;
};

function formatFirestoreDate(
  value: ManittoSeason['recruitEndsAt'] | ManittoSeason['eventDate']
): string {
  if (!value?.seconds) return '';
  return new Date(value.seconds * 1000).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
  });
}

function isManittoAdmin(user: HomeUser | null): boolean {
  if (!user) return false;
  return user.role === '리더' || user.nickname === '너래';
}

function isNeraeUser(user: HomeUser | null): boolean {
  return Boolean(user && user.nickname === '너래');
}

const ManittoBubble: React.FC<{ user: HomeUser | null }> = ({ user }) => {
  const [season, setSeason] = useState<ManittoSeason | null>(null);
  const [participant, setParticipant] = useState<ManittoParticipant | null>(null);
  const [assignment, setAssignment] = useState<ManittoAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);

  const [adminTitle, setAdminTitle] = useState('');
  const [adminGuide, setAdminGuide] = useState('');
  const [roster, setRoster] = useState<ManittoParticipant[]>([]);
  const [assignmentRows, setAssignmentRows] = useState<ManittoAssignmentRow[]>([]);
  const [memberOptions, setMemberOptions] = useState<Array<{ uid: string; nickname: string }>>([]);
  const [addMemberUid, setAddMemberUid] = useState('');
  const modalBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeActiveManittoSeason(
      (next) => {
        setSeason(next);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        toast.error(err.message || '마니또 회차를 불러오지 못했습니다.');
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!season?.id || !user?.uid) {
      setParticipant(null);
      return;
    }
    return subscribeManittoParticipant(season.id, user.uid, setParticipant);
  }, [season?.id, user?.uid]);

  useEffect(() => {
    if (!season?.id) {
      setParticipantCount(0);
      return;
    }
    return subscribeManittoParticipantCount(season.id, setParticipantCount);
  }, [season?.id]);

  const canViewRoster = Boolean(showModal && season?.id && (isManittoAdmin(user) || isNeraeUser(user)));

  useEffect(() => {
    if (!canViewRoster || !season?.id) {
      setRoster([]);
      return;
    }
    return subscribeManittoParticipants(season.id, setRoster);
  }, [canViewRoster, season?.id]);

  useEffect(() => {
    if (!isNeraeUser(user) || !season?.id) {
      setAssignmentRows([]);
      return;
    }
    return subscribeManittoAssignmentRows(season.id, setAssignmentRows);
  }, [user, season?.id]);

  useEffect(() => {
    if (!isNeraeUser(user)) return;
    void fetchWorldCupMemberOptions().then((list) =>
      setMemberOptions(list.map((m) => ({ uid: m.uid, nickname: m.nickname })))
    );
  }, [user?.nickname]);

  const rosterUidSet = useMemo(() => new Set(roster.map((p) => p.uid)), [roster]);
  const addableMembers = useMemo(
    () => memberOptions.filter((m) => !rosterUidSet.has(m.uid)),
    [memberOptions, rosterUidSet]
  );

  const namesRevealed = season?.status === 'closed' || season?.status === 'drawn';

  useEffect(() => {
    if (!season?.id || !user?.uid || !participant || !namesRevealed) {
      setAssignment(null);
      return;
    }
    return subscribeMyManittoAssignment(season.id, user.uid, setAssignment);
  }, [season?.id, season?.status, user?.uid, participant, namesRevealed]);

  const pairCandidates = useMemo(() => {
    if (roster.length > 0) {
      return roster.map((p) => ({ uid: p.uid, nickname: p.nickname }));
    }
    const map = new Map<string, string>();
    for (const row of assignmentRows) {
      map.set(row.giverUid, row.giverNickname);
      if (!map.has(row.receiverUid)) map.set(row.receiverUid, row.receiverNickname);
    }
    return [...map.entries()]
      .map(([uid, nickname]) => ({ uid, nickname }))
      .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));
  }, [roster, assignmentRows]);

  const bubblePreview = useMemo(() => {
    if (!season) return '진행 중인 회차 없음';
    if (!namesRevealed) {
      if (isNeraeUser(user) && assignmentRows.length > 0) {
        return `비공개 매칭 ${assignmentRows.length}명`;
      }
      if (participant) return `${season.title} · 참여 중`;
      return season.title;
    }
    if (assignment) return `🎁 ${assignment.receiverNickname}`;
    if (participant) return `${season.title} · 참여 중`;
    return season.title;
  }, [season, participant, assignment, user, assignmentRows.length, namesRevealed]);

  const bubbleHint = useMemo(() => {
    if (!season) return '리더가 회차를 열면 알려드려요';
    if (!namesRevealed) {
      if (isNeraeUser(user)) return '마감 전 · 탭해서 짝 조정';
      return participant ? '모집 마감 전까지 마니또 비공개' : '탭해서 참가하기';
    }
    if (isNeraeUser(user)) return '탭해서 전체 짝 확인·조정';
    if (season.status === 'closed') return assignment ? '내 마니또 확인' : '배정 준비 중';
    if (season.status === 'drawn') return participant ? '내 마니또 확인' : '추첨 완료';
    return '';
  }, [season, participant, assignment, user, namesRevealed]);

  const showMyAssignment = Boolean(participant && assignment && namesRevealed);

  const openModal = useCallback(() => {
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : '처리 중 오류가 발생했습니다.';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  if (!user?.uid) return null;

  const modal = showModal && (
    <div className="manitto-modal-overlay" onClick={closeModal} role="presentation">
      <div
        className="manitto-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manitto-modal-title"
      >
        <div className="manitto-modal__hero">
          <div className="manitto-modal__hero-top">
            <div>
              <span className="manitto-bubble__label">🎁 VERYUS 마니또</span>
              <h3 id="manitto-modal-title" className="manitto-modal__title">
                {season?.title ?? '마니또'}
              </h3>
              <p className="manitto-modal__sub">
                나에게 배정된 <strong>선물 받을 사람</strong>만 볼 수 있어요. 누가 나의
                마니또인지(나를 뽑은 사람)는 공개되지 않습니다.
              </p>
            </div>
            <button type="button" className="manitto-modal__close" onClick={closeModal} aria-label="닫기">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="manitto-modal__body" ref={modalBodyRef}>
          {!season ? (
            <div className="manitto-modal__empty">
              <p>지금 진행 중인 마니또 회차가 없습니다.</p>
              {isManittoAdmin(user) && (
                <p style={{ marginTop: 8, fontSize: '0.82rem' }}>
                  아래에서 새 회차를 만들 수 있습니다.
                </p>
              )}
            </div>
          ) : (
            <>
              <span className="manitto-modal__status">{MANITTO_STATUS_LABEL[season.status]}</span>
              <div className="manitto-modal__card">
                <p className="manitto-modal__card-title">{season.title}</p>
                {season.recruitEndsAt ? (
                  <p className="manitto-modal__meta">참가 마감: {formatFirestoreDate(season.recruitEndsAt)}</p>
                ) : null}
                {season.eventDate ? (
                  <p className="manitto-modal__meta">선물·공개일: {formatFirestoreDate(season.eventDate)}</p>
                ) : null}
                <p className="manitto-modal__meta">
                  참가 {participantCount}명
                  {participant ? ' · 나 참여 중' : ''}
                </p>
                {season.giftGuide ? (
                  <p className="manitto-modal__guide">{season.giftGuide}</p>
                ) : null}
              </div>

              {showMyAssignment ? (
                <div className="manitto-modal__card manitto-modal__receiver">
                  <Gift size={28} color="#c2410c" aria-hidden />
                  <p className="manitto-modal__receiver-note">내가 챙길 마니또</p>
                  <p className="manitto-modal__receiver-name">{assignment!.receiverNickname}</p>
                  <p className="manitto-modal__receiver-note">
                    {season.status === 'drawn'
                      ? '추첨이 확정되었습니다.'
                      : '참가 모집이 마감되어 마니또가 공개되었습니다.'}
                  </p>
                </div>
              ) : null}

              {season.status === 'recruiting' && participant ? (
                <p className="manitto-modal__receiver-note" style={{ textAlign: 'center' }}>
                  참가 모집 마감 버튼을 누르기 전에는 내 마니또가 공개되지 않습니다.
                </p>
              ) : null}

              {participant &&
              namesRevealed &&
              !assignment &&
              participantCount >= MANITTO_MIN_PARTICIPANTS ? (
                <p className="manitto-modal__receiver-note" style={{ textAlign: 'center' }}>
                  배정을 맞추는 중입니다…
                </p>
              ) : null}

              {participant &&
              namesRevealed &&
              !assignment &&
              participantCount > 0 &&
              participantCount < MANITTO_MIN_PARTICIPANTS ? (
                <p className="manitto-modal__receiver-note" style={{ textAlign: 'center' }}>
                  참가 {MANITTO_MIN_PARTICIPANTS}명 이상이 되면 마니또를 정할 수 있습니다.
                </p>
              ) : null}

              {season.status === 'recruiting' && !participant ? (
                <button
                  type="button"
                  className="manitto-modal__btn manitto-modal__btn--primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await joinManittoSeason(season.id, {
                        uid: user.uid,
                        nickname: user.nickname ?? '',
                      });
                      toast.success('참가했습니다!');
                    })
                  }
                >
                  {busy ? '처리 중…' : '이번 회차 참가하기'}
                </button>
              ) : null}

              {season.status === 'recruiting' && participant ? (
                <button
                  type="button"
                  className="manitto-modal__btn manitto-modal__btn--secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await leaveManittoSeason(season.id, user.uid);
                      toast.info('참가를 취소했습니다.');
                    })
                  }
                >
                  참가 취소
                </button>
              ) : null}

              {season.status === 'closed' && participant && !assignment ? (
                <p className="manitto-modal__receiver-note" style={{ textAlign: 'center' }}>
                  모집이 마감되었습니다. 참가 인원이 충분하면 위에서 마니또를 확인할 수 있어요.
                </p>
              ) : null}

              {season.status === 'drawn' && !participant ? (
                <p className="manitto-modal__empty">이번 회차에 참가하지 않아 배정이 없습니다.</p>
              ) : null}

              {isManittoAdmin(user) ? (
                <div className="manitto-modal__admin-summary">
                  <p className="manitto-modal__admin-summary-title">운영 확인</p>
                  <ul className="manitto-modal__admin-steps">
                    <li>
                      <strong>회차</strong> · {season.title} ({MANITTO_STATUS_LABEL[season.status]})
                    </li>
                    <li>
                      <strong>참가</strong> · {participantCount}명
                      {season.status !== 'drawn' && participantCount < MANITTO_MIN_PARTICIPANTS
                        ? ` (추첨 최소 ${MANITTO_MIN_PARTICIPANTS}명)`
                        : ''}
                    </li>
                    {season.status === 'recruiting' ? (
                      <li>
                        <strong>다음</strong> · 마감 전까지 참가자에게 마니또는 보이지 않습니다.
                        「참가 모집 마감」을 누르면 공개됩니다.
                      </li>
                    ) : null}
                    {season.status === 'closed' ? (
                      <li>
                        <strong>다음</strong> · 공개된 짝을 확인한 뒤 「추첨 확정」으로 고정
                      </li>
                    ) : null}
                    {season.status === 'drawn' ? (
                      <li>
                        <strong>다음</strong> · 행사 후 「회차 종료(아카이브)」
                      </li>
                    ) : null}
                  </ul>
                  {season.status !== 'drawn' ? (
                    roster.length > 0 ? (
                      <p className="manitto-modal__roster-preview">
                        참가자: {roster.map((p) => p.nickname).join(', ')}
                      </p>
                    ) : (
                      <p className="manitto-modal__roster-preview manitto-modal__roster-preview--muted">
                        아직 참가자가 없습니다. 본인도 「이번 회차 참가하기」로 넣을 수 있어요.
                      </p>
                    )
                  ) : null}
                </div>
              ) : null}
            </>
          )}

          {isNeraeUser(user) && season ? (
            <div className="manitto-modal__nerae">
              <p className="manitto-modal__nerae-title">너래 전용 · 전체 매칭 · 인원 조정</p>
              <p className="manitto-modal__nerae-hint">
                한 줄이 한 짝입니다. 오른쪽 이름을 고르면 그 사람을 맡고 있던 마니또는
                다른 사람으로 자동으로 옮겨집니다. 모집 마감 전에는 다른 사람에게 마니또가
                보이지 않습니다.
              </p>

              {(season.status === 'recruiting' || season.status === 'closed') && (
                <div className="manitto-modal__roster-actions">
                  <select
                    value={addMemberUid}
                    onChange={(e) => setAddMemberUid(e.target.value)}
                    aria-label="추가할 멤버"
                  >
                    <option value="">멤버 추가…</option>
                    {addableMembers.map((m) => (
                      <option key={m.uid} value={m.uid}>
                        {m.nickname}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="manitto-modal__btn manitto-modal__btn--secondary"
                    style={{ width: 'auto', flex: '0 0 auto', marginTop: 0, padding: '8px 12px' }}
                    disabled={busy || !addMemberUid}
                    onClick={() =>
                      void run(async () => {
                        const picked = memberOptions.find((m) => m.uid === addMemberUid);
                        if (!picked) return;
                        await adminAddManittoParticipant(season.id, picked);
                        setAddMemberUid('');
                        toast.success(`${picked.nickname}님을 추가했습니다.`);
                      })
                    }
                  >
                    추가
                  </button>
                </div>
              )}

              {assignmentRows.length > 0 ? (
                <>
                  <p className="manitto-modal__nerae-live-badge">
                    {season.status === 'drawn'
                      ? '추첨 확정'
                      : season.status === 'closed'
                        ? '공개됨 · 모집 마감'
                        : '비공개 · 모집 중'}{' '}
                    · {assignmentRows.length}명
                  </p>
                  <div className="manitto-modal__pair-list">
                    <div className="manitto-modal__pair-legend" aria-hidden>
                      <span>주는 사람</span>
                      <span />
                      <span>마니또</span>
                    </div>
                    {assignmentRows.map((row) => (
                      <div key={row.giverUid} className="manitto-modal__pair-row">
                        <span className="manitto-modal__pair-giver">{row.giverNickname}</span>
                        <span className="manitto-modal__pair-arrow" aria-hidden>
                          →
                        </span>
                        <select
                          className="manitto-modal__pair-select"
                          value={row.receiverUid}
                          disabled={busy}
                          aria-label={`${row.giverNickname}의 마니또`}
                          onChange={(e) => {
                            const nextUid = e.target.value;
                            if (!nextUid || nextUid === row.receiverUid) return;
                            const nextName =
                              pairCandidates.find((p) => p.uid === nextUid)?.nickname ?? nextUid;
                            void run(async () => {
                              const changed = await adminSwapManittoReceiver(
                                season.id,
                                row.giverUid,
                                nextUid
                              );
                              const others = changed.filter((item) => item.giverUid !== row.giverUid);
                              const moved =
                                others.length > 0
                                  ? ` 겹치던 쪽도 옮겼습니다: ${others
                                      .map((item) => `${item.giverNickname} → ${item.receiverNickname}`)
                                      .join(', ')}`
                                  : '';
                              toast.success(`${row.giverNickname} → ${nextName} 으로 바꿨습니다.${moved}`);
                            });
                          }}
                        >
                          {pairCandidates
                            .filter((p) => p.uid !== row.giverUid)
                            .map((p) => (
                              <option key={p.uid} value={p.uid}>
                                {p.nickname}
                              </option>
                            ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  {season.status === 'drawn' ? (
                    <button
                      type="button"
                      className="manitto-modal__btn manitto-modal__btn--secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (
                            !window.confirm(
                              '추첨 결과를 지우고 마감 상태로 돌아갑니다. 인원을 수정한 뒤 다시 확정하세요.'
                            )
                          ) {
                            return;
                          }
                          await adminClearManittoDraw(season.id);
                          toast.info('재추첨 준비 완료. 인원 조정 후 추첨 확정하세요.');
                        })
                      }
                    >
                      재추첨 준비 (결과 삭제)
                    </button>
                  ) : null}
                </>
              ) : (
                <p className="manitto-modal__roster-preview manitto-modal__roster-preview--muted">
                  참가 {participantCount}/{MANITTO_MIN_PARTICIPANTS}명 ·{' '}
                  {MANITTO_MIN_PARTICIPANTS}명이 모이면 여기서 짝을 맞출 수 있습니다. 마감 전에는
                  참가자에게 보이지 않습니다.
                </p>
              )}

              {(season.status === 'recruiting' || season.status === 'closed') && (
                <table className="manitto-modal__roster-table">
                  <thead>
                    <tr>
                      <th>참가자</th>
                      <th style={{ width: 64 }}>제거</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((p) => (
                      <tr key={p.uid}>
                        <td>{p.nickname}</td>
                        <td>
                          <button
                            type="button"
                            className="manitto-modal__mini-btn"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                if (!window.confirm(`${p.nickname}님을 참가 목록에서 빼시겠습니까?`)) {
                                  return;
                                }
                                await adminRemoveManittoParticipant(season.id, p.uid);
                                toast.info('참가자를 제거했습니다.');
                              })
                            }
                          >
                            빼기
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}

          {isManittoAdmin(user) && (
            <div className="manitto-modal__admin">
              <p className="manitto-modal__admin-title">운영 (리더)</p>
              {!season ? (
                <>
                  <input
                    className="manitto-modal__field"
                    placeholder="회차 제목 (예: 2026 겨울 마니또)"
                    value={adminTitle}
                    onChange={(e) => setAdminTitle(e.target.value)}
                  />
                  <textarea
                    className="manitto-modal__field"
                    placeholder="선물 가격대·규칙 (선택)"
                    rows={3}
                    value={adminGuide}
                    onChange={(e) => setAdminGuide(e.target.value)}
                  />
                  <button
                    type="button"
                    className="manitto-modal__btn manitto-modal__btn--primary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const title = adminTitle.trim();
                        const giftGuide = adminGuide.trim();
                        const seasonId = await createManittoSeason({
                          title,
                          giftGuide,
                          createdBy: user.uid,
                          createdByNickname: user.nickname ?? '',
                        });
                        setSeason({
                          id: seasonId,
                          title,
                          status: 'recruiting',
                          giftGuide: giftGuide || undefined,
                          createdBy: user.uid,
                          createdByNickname: user.nickname ?? '',
                          participantCount: 0,
                        });
                        setAdminTitle('');
                        setAdminGuide('');
                        toast.success(`「${title}」 회차를 열었습니다. 위에서 상태를 확인하세요.`);
                        modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                      })
                    }
                  >
                    새 회차 만들기
                  </button>
                </>
              ) : (
                <>
                  {season.status === 'recruiting' ? (
                    <button
                      type="button"
                      className="manitto-modal__btn manitto-modal__btn--secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await closeManittoRecruiting(season.id);
                          toast.success('참가 모집을 마감했습니다.');
                        })
                      }
                    >
                      참가 모집 마감
                    </button>
                  ) : null}
                  {(season.status === 'closed' || season.status === 'recruiting') && (
                    <button
                      type="button"
                      className="manitto-modal__btn manitto-modal__btn--primary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const n = await drawManittoSeason(season.id);
                          toast.success(`추첨 완료 (${n}명)`);
                        })
                      }
                    >
                      추첨 확정 (배정 고정)
                    </button>
                  )}
                  {season.status === 'drawn' ? (
                    <button
                      type="button"
                      className="manitto-modal__btn manitto-modal__btn--ghost"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (!window.confirm('회차를 종료하고 메인에서 숨길까요?')) return;
                          await archiveManittoSeason(season.id);
                          toast.success('회차를 종료했습니다.');
                        })
                      }
                    >
                      회차 종료(아카이브)
                    </button>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div
        className="manitto-bubble"
        onClick={openModal}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openModal();
          }
        }}
        title="마니또"
      >
        <div className="manitto-bubble__content">
          {loading ? (
            <span className="manitto-bubble__text">…</span>
          ) : (
            <>
              <span className="manitto-bubble__label">🎁 마니또</span>
              <span className="manitto-bubble__text">{bubblePreview}</span>
              <span className="manitto-bubble__hint">{bubbleHint}</span>
            </>
          )}
        </div>
        <div className="manitto-bubble__tail" aria-hidden />
      </div>
      {typeof document !== 'undefined' && showModal && createPortal(modal, document.body)}
    </>
  );
};

export default ManittoBubble;
