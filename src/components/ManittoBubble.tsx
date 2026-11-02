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
      setAssignmentRows([]);
      return;
    }
    const unsubRoster = subscribeManittoParticipants(season.id, setRoster);
    const unsubAssign =
      isNeraeUser(user) && season.status === 'drawn'
        ? subscribeManittoAssignmentRows(season.id, setAssignmentRows)
        : () => {
            setAssignmentRows([]);
          };
    if (isNeraeUser(user)) {
      void fetchWorldCupMemberOptions().then((list) =>
        setMemberOptions(list.map((m) => ({ uid: m.uid, nickname: m.nickname })))
      );
    }
    return () => {
      unsubRoster();
      unsubAssign();
    };
  }, [canViewRoster, user, season?.id, season?.status]);

  const rosterUidSet = useMemo(() => new Set(roster.map((p) => p.uid)), [roster]);
  const addableMembers = useMemo(
    () => memberOptions.filter((m) => !rosterUidSet.has(m.uid)),
    [memberOptions, rosterUidSet]
  );

  useEffect(() => {
    if (!season?.id || !user?.uid || season.status !== 'drawn') {
      setAssignment(null);
      return;
    }
    return subscribeMyManittoAssignment(season.id, user.uid, setAssignment);
  }, [season?.id, season?.status, user?.uid]);

  const bubblePreview = useMemo(() => {
    if (!season) return '진행 중인 회차 없음';
    if (season.status === 'drawn' && assignment) {
      return `🎁 ${assignment.receiverNickname}`;
    }
    if (participant) return `${season.title} · 참여 중`;
    return season.title;
  }, [season, participant, assignment]);

  const bubbleHint = useMemo(() => {
    if (!season) return '리더가 회차를 열면 알려드려요';
    if (season.status === 'recruiting') return '탭해서 참가하기';
    if (season.status === 'closed') return '추첨 대기 중';
    if (season.status === 'drawn') return participant ? '내 마니또 확인' : '추첨 완료';
    return '';
  }, [season, participant]);

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

              {season.status === 'drawn' && participant && assignment ? (
                <div className="manitto-modal__card manitto-modal__receiver">
                  <Gift size={28} color="#c2410c" aria-hidden />
                  <p className="manitto-modal__receiver-note">내가 챙길 마니또</p>
                  <p className="manitto-modal__receiver-name">{assignment.receiverNickname}</p>
                  <p className="manitto-modal__receiver-note">
                    추첨 후에는 배정이 바뀌지 않습니다. 즐거운 선물 되세요!
                  </p>
                </div>
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

              {season.status === 'closed' && participant ? (
                <p className="manitto-modal__receiver-note" style={{ textAlign: 'center' }}>
                  모집이 마감되었습니다. 추첨이 끝나면 여기서 마니또를 확인할 수 있어요.
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
                        <strong>다음</strong> · 멤버 참가 유도 → 「참가 모집 마감」 → 「추첨 실행」
                      </li>
                    ) : null}
                    {season.status === 'closed' ? (
                      <li>
                        <strong>다음</strong> · 참가 {MANITTO_MIN_PARTICIPANTS}명 이상이면 「추첨 실행」
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
                추첨 전에는 참가자를 추가·제거할 수 있습니다. 추첨 후에는 전체 짝을 확인하고
                받는 사람을 바꿀 때는 드롭다운으로 교환(서로 맞바꿈)됩니다. 인원을 크게
                바꿀 때는 「재추첨 준비」 후 다시 추첨하세요.
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

              {season.status === 'drawn' ? (
                <>
                  <table className="manitto-modal__roster-table">
                    <thead>
                      <tr>
                        <th>참가자</th>
                        <th>→ 마니또(받는 사람)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignmentRows.map((row) => (
                        <tr key={row.giverUid}>
                          <td>{row.giverNickname}</td>
                          <td>
                            <select
                              className="manitto-modal__roster-select"
                              value={row.receiverUid}
                              disabled={busy}
                              onChange={(e) => {
                                const next = e.target.value;
                                if (!next || next === row.receiverUid) return;
                                void run(async () => {
                                  await adminSwapManittoReceiver(season.id, row.giverUid, next);
                                  toast.success('배정을 수정했습니다.');
                                });
                              }}
                            >
                              {roster.map((p) => (
                                <option
                                  key={p.uid}
                                  value={p.uid}
                                  disabled={p.uid === row.giverUid}
                                >
                                  {p.nickname}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    type="button"
                    className="manitto-modal__btn manitto-modal__btn--secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        if (
                          !window.confirm(
                            '추첨 결과를 지우고 마감 상태로 돌아갑니다. 인원을 수정한 뒤 다시 추첨하세요.'
                          )
                        ) {
                          return;
                        }
                        await adminClearManittoDraw(season.id);
                        toast.info('재추첨 준비 완료. 인원 조정 후 추첨을 실행하세요.');
                      })
                    }
                  >
                    재추첨 준비 (결과 삭제)
                  </button>
                </>
              ) : (
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
                      추첨 실행
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
