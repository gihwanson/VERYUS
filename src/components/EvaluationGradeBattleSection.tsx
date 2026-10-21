import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { getContestGradeFromScore } from '../utils/contestGrade';
import {
  buildContestAggregationContext,
  type ContestGradeRecord,
} from '../utils/contestGradesAggregation';
import { GRADE_NAMES, GRADES_FOR_ADMIN_SELECT, SUPER_ADMIN_NICKNAMES } from './AdminTypes';
import { getGradeEmoji } from '../utils/gradeDisplay';
import {
  GRADE_BATTLE_STATUS_ASSIGNED,
  GRADE_BATTLE_STATUS_PENDING_ASSIGN,
  assignGradeBattleMemberGrade,
  gradeBattleScoresCollection,
  isGradeBattleScoringOpen,
  formatGradeBattleDday,
  type GradeBattlePostLike,
} from '../utils/evaluationGradeBattle';

type Props = {
  post: GradeBattlePostLike & {
    id: string;
    writerNickname: string;
    writerUid: string;
    assignedMemberGrade?: string;
  };
  user: { uid: string; nickname: string; role?: string; grade?: string } | null;
  requireFullListen: boolean;
  hasFullyListened: boolean;
  onPostPatch: (patch: Partial<Props['post']>) => void;
};

const evaluatorFields = (u: { nickname: string; role?: string; grade?: string }) => ({
  evaluator: u.nickname,
  evaluatorRole: u.role || '일반',
  evaluatorGrade: getGradeEmoji(u.grade),
});

const EvaluationGradeBattleSection: React.FC<Props> = ({
  post,
  user,
  requireFullListen,
  hasFullyListened,
  onPostPatch,
}) => {
  const [grades, setGrades] = useState<ContestGradeRecord[]>([]);
  const [scoreInput, setScoreInput] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitAck, setSubmitAck] = useState<'created' | 'updated' | null>(null);
  const [evaluatorGradeByNickname, setEvaluatorGradeByNickname] = useState<Record<string, string>>({});
  const [selectedGrade, setSelectedGrade] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [resultsTab, setResultsTab] = useState<'overall' | 'cluster'>('overall');

  const targetNickname = post.writerNickname;
  const scoringOpen = isGradeBattleScoringOpen(post);
  const isNerae = Boolean(
    user?.nickname && SUPER_ADMIN_NICKNAMES.includes(user.nickname)
  );
  const isAuthor = Boolean(user && user.uid === post.writerUid);
  const pendingAssign = post.status === GRADE_BATTLE_STATUS_PENDING_ASSIGN;
  const assigned = post.status === GRADE_BATTLE_STATUS_ASSIGNED;

  useEffect(() => {
    if (!post.id) return;
    const unsub = onSnapshot(gradeBattleScoresCollection(post.id), (snap) => {
      setGrades(
        snap.docs.map((d) => d.data() as ContestGradeRecord)
      );
    });
    return () => unsub();
  }, [post.id]);

  useEffect(() => {
    getDocs(collection(db, 'users')).then((snap) => {
      const map: Record<string, string> = {};
      snap.forEach((d) => {
        const data = d.data();
        if (data.nickname) map[data.nickname] = data.grade ?? '';
      });
      setEvaluatorGradeByNickname(map);
    });
  }, []);

  const aggregation = useMemo(
    () => buildContestAggregationContext(grades, evaluatorGradeByNickname),
    [grades, evaluatorGradeByNickname]
  );

  const targetStats = aggregation.byTarget[targetNickname];

  useEffect(() => {
    if (!selectedGrade && targetStats?.clusterMean != null) {
      const suggested = getContestGradeFromScore(targetStats.clusterMean);
      const emoji = suggested.split(' ')[0];
      if (emoji && (GRADES_FOR_ADMIN_SELECT as readonly string[]).includes(emoji)) {
        setSelectedGrade(emoji);
      }
    }
  }, [targetStats?.clusterMean, selectedGrade]);

  const suggestedFromScore =
    scoreInput !== '' && Number.isFinite(Number(scoreInput))
      ? getContestGradeFromScore(Number(scoreInput))
      : '';

  const myExisting = useMemo(
    () =>
      user
        ? grades.find((g) => g.evaluator === user.nickname && g.target === targetNickname)
        : undefined,
    [grades, user, targetNickname]
  );

  /** 너래 전용: 해당 글 작성자에 대한 멤버 채점·코멘트 */
  const memberSubmissionsForNerae = useMemo(() => {
    return grades
      .filter((g) => g.target === targetNickname)
      .map((g) => ({
        evaluator: String(g.evaluator || '익명').trim() || '익명',
        score: Number(g.score),
        comment: String(g.comment || '').trim(),
      }))
      .sort((a, b) => a.evaluator.localeCompare(b.evaluator, 'ko'));
  }, [grades, targetNickname]);

  useEffect(() => {
    if (myExisting) {
      setScoreInput(String(myExisting.score ?? ''));
      setCommentInput(String(myExisting.comment ?? ''));
    }
  }, [myExisting?.evaluator, myExisting?.score, myExisting?.comment]);

  const hasSubmittedScore = Boolean(myExisting);
  const savedScore = myExisting ? Number(myExisting.score) : NaN;
  const savedComment = String(myExisting?.comment ?? '').trim();
  const isScoreDirty =
    hasSubmittedScore &&
    (scoreInput !== String(myExisting?.score ?? '') ||
      commentInput.trim() !== savedComment);

  useEffect(() => {
    if (!submitAck) return;
    const t = window.setTimeout(() => setSubmitAck(null), 5000);
    return () => window.clearTimeout(t);
  }, [submitAck]);

  const handleSubmitScore = async () => {
    if (!user || !post.id) return;
    if (isAuthor) {
      setError('본인 곡은 채점할 수 없습니다.');
      return;
    }
    if (requireFullListen && !hasFullyListened) {
      setError('녹음 파일을 절반 이상(실제 재생 시간 기준) 들은 뒤 채점할 수 있습니다.');
      return;
    }
    if (!scoringOpen) {
      setError('채점 기간이 종료되었습니다.');
      return;
    }
    const num = Number(scoreInput);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      setError('0~100점 사이의 점수를 입력하세요.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const q = query(
        gradeBattleScoresCollection(post.id),
        where('evaluator', '==', user.nickname),
        where('target', '==', targetNickname)
      );
      const snap = await getDocs(q);
      const payload = {
        ...evaluatorFields(user),
        target: targetNickname,
        score: num,
        comment: commentInput.trim(),
      };
      if (!snap.empty) {
        await updateDoc(snap.docs[0].ref, { ...payload, updatedAt: new Date() });
        setSubmitAck('updated');
      } else {
        await addDoc(gradeBattleScoresCollection(post.id), {
          ...payload,
          createdAt: new Date(),
        });
        setSubmitAck('created');
      }
    } catch (e) {
      console.error(e);
      setError('제출 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignGrade = async () => {
    if (!isNerae || !user || !selectedGrade) return;
    if (
      !window.confirm(
        `${post.writerNickname}님에게 ${GRADE_NAMES[selectedGrade] || selectedGrade} 등급을 부여하시겠습니까?`
      )
    ) {
      return;
    }
    setAssigning(true);
    try {
      await assignGradeBattleMemberGrade({
        postId: post.id,
        writerUid: post.writerUid,
        gradeEmoji: selectedGrade,
      });
      onPostPatch({
        status: GRADE_BATTLE_STATUS_ASSIGNED,
        assignedMemberGrade: selectedGrade,
      });
      alert('등급이 부여되었습니다. 관리자 패널 회원 목록에 반영됩니다.');
    } catch (e) {
      console.error(e);
      alert('등급 부여 중 오류가 발생했습니다.');
    } finally {
      setAssigning(false);
    }
  };

  const formatMean = (v: number | null | undefined) =>
    v != null && Number.isFinite(v) ? v.toFixed(1) : '—';

  return (
    <div
      style={{
        margin: '18px 0 0 0',
        padding: '16px',
        borderRadius: 14,
        background: '#F8FAFC',
        border: '1px solid #E2E8F0',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#334155', textAlign: 'center', marginBottom: 10 }}>
        등급전 멤버 채점
        {formatGradeBattleDday(post) && (
          <span style={{ marginLeft: 8, color: '#D97706', fontSize: '0.92rem' }}>
            {formatGradeBattleDday(post)}
          </span>
        )}
      </div>

      {assigned && post.assignedMemberGrade && (
        <div
          style={{
            textAlign: 'center',
            padding: '12px',
            borderRadius: 10,
            background: '#ECFDF5',
            color: '#047857',
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          부여된 등급: {post.assignedMemberGrade} {GRADE_NAMES[post.assignedMemberGrade] || ''}
        </div>
      )}

      {pendingAssign && (
        <div
          style={{
            textAlign: 'center',
            padding: '12px',
            borderRadius: 10,
            background: '#EFF6FF',
            color: '#1D4ED8',
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          등급부여 대기중
        </div>
      )}

      {scoringOpen && user && !isAuthor && (
        <div style={{ maxWidth: 420, margin: '0 auto' }}>
          {hasSubmittedScore && Number.isFinite(savedScore) && (
            <div
              style={{
                marginBottom: 14,
                padding: '12px 14px',
                borderRadius: 10,
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                color: '#047857',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>✅ 채점 제출 완료</div>
              <div style={{ fontSize: 14 }}>
                제출 점수: <strong>{savedScore}점</strong>
                {getContestGradeFromScore(savedScore) && (
                  <span style={{ marginLeft: 6, color: '#6D28D9' }}>
                    ({getContestGradeFromScore(savedScore)})
                  </span>
                )}
              </div>
              {savedComment ? (
                <div style={{ fontSize: 13, marginTop: 6, color: '#065F46' }}>코멘트: {savedComment}</div>
              ) : null}
              <div style={{ fontSize: 12, marginTop: 8, color: '#059669' }}>
                {isScoreDirty
                  ? '입력을 변경했습니다. 아래 「수정 저장」을 눌러 반영해 주세요.'
                  : '점수·코멘트를 바꾼 뒤 「수정 저장」으로 다시 제출할 수 있습니다.'}
              </div>
            </div>
          )}
          {submitAck && (
            <div
              style={{
                marginBottom: 12,
                padding: '10px 12px',
                borderRadius: 8,
                background: '#F0FDF4',
                border: '1px solid #86EFAC',
                color: '#166534',
                fontWeight: 700,
                fontSize: 14,
                textAlign: 'center',
              }}
            >
              {submitAck === 'created' ? '채점이 제출되었습니다.' : '수정 내용이 저장되었습니다.'}
            </div>
          )}
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>점수 (0~100)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={scoreInput}
            onChange={(e) => setScoreInput(e.target.value)}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #CBD5E1' }}
            placeholder="0~100"
          />
          {suggestedFromScore && (
            <div style={{ marginTop: 8, color: '#7C3AED', fontWeight: 700 }}>추천등급: {suggestedFromScore}</div>
          )}
          <label style={{ fontWeight: 600, display: 'block', marginTop: 12, marginBottom: 6 }}>코멘트 (선택)</label>
          <textarea
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            rows={2}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #CBD5E1' }}
          />
          {error && <div style={{ color: '#DC2626', marginTop: 8, fontSize: 14 }}>{error}</div>}
          <button
            type="button"
            disabled={
              submitting || (requireFullListen && !hasFullyListened) || (hasSubmittedScore && !isScoreDirty)
            }
            onClick={() => void handleSubmitScore()}
            style={{
              marginTop: 12,
              width: '100%',
              padding: '12px 16px',
              borderRadius: 10,
              border: hasSubmittedScore ? '2px solid #8B5CF6' : 'none',
              background: hasSubmittedScore ? '#fff' : '#8B5CF6',
              color: hasSubmittedScore ? '#6D28D9' : '#fff',
              fontWeight: 700,
              cursor: submitting ? 'wait' : 'pointer',
              opacity: requireFullListen && !hasFullyListened ? 0.6 : hasSubmittedScore && !isScoreDirty ? 0.55 : 1,
            }}
          >
            {!hasSubmittedScore ? '채점 제출' : isScoreDirty ? '수정 저장' : '제출 완료됨'}
          </button>
          {hasSubmittedScore && !isScoreDirty && (
            <p style={{ fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 8 }}>
              이미 제출된 채점입니다. 변경 후에만 다시 저장할 수 있습니다.
            </p>
          )}
          {requireFullListen && !hasFullyListened && (
            <p style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>
              녹음 파일을 절반 이상(실제 재생 시간 기준) 들어야 채점할 수 있습니다. 원하는 구간으로 이동해 들을 수
              있습니다.
            </p>
          )}
          {requireFullListen && hasFullyListened && (
            <p style={{ fontSize: 13, color: '#059669', textAlign: 'center', marginTop: 8, fontWeight: 600 }}>
              녹음을 절반 이상 들으셨습니다. 채점을 진행해 주세요.
            </p>
          )}
        </div>
      )}

      {scoringOpen && isAuthor && (
        <p style={{ textAlign: 'center', color: '#64748B', fontSize: 14 }}>
          멤버 채점이 진행 중입니다. (본인은 채점할 수 없습니다)
        </p>
      )}

      {(pendingAssign || (isNerae && assigned)) && (
        <div style={{ marginTop: 16 }}>
          {isNerae && targetStats ? (
            <>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setResultsTab('overall')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 600,
                    background: resultsTab === 'overall' ? '#6366F1' : '#E2E8F0',
                    color: resultsTab === 'overall' ? '#fff' : '#334155',
                  }}
                >
                  전체평균
                </button>
                <button
                  type="button"
                  onClick={() => setResultsTab('cluster')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 600,
                    background: resultsTab === 'cluster' ? '#6366F1' : '#E2E8F0',
                    color: resultsTab === 'cluster' ? '#fff' : '#334155',
                  }}
                >
                  중심평균
                </button>
              </div>
              <div
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: 16,
                  border: '1px solid #E2E8F0',
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 15, marginBottom: 6 }}>
                  <strong>전체평균(가중):</strong> {formatMean(targetStats.overallMean)}점
                  {targetStats.overallMean != null && (
                    <span style={{ marginLeft: 8, color: '#7C3AED' }}>
                      {getContestGradeFromScore(targetStats.overallMean)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 15 }}>
                  <strong>중심평균:</strong> {formatMean(targetStats.clusterMean)}점
                  {targetStats.clusterMean != null && (
                    <span style={{ marginLeft: 8, color: '#7C3AED' }}>
                      {getContestGradeFromScore(targetStats.clusterMean)}
                    </span>
                  )}
                </div>
                {resultsTab === 'cluster' && targetStats.clusterBreakdown.selectedBinLabel && (
                  <div style={{ marginTop: 10, fontSize: 13, color: '#475569' }}>
                    선택 구간: {targetStats.clusterBreakdown.selectedBinLabel}
                    {targetStats.clusterBreakdown.tieNote && (
                      <div style={{ marginTop: 4 }}>{targetStats.clusterBreakdown.tieNote}</div>
                    )}
                  </div>
                )}
                <div style={{ marginTop: 10, fontSize: 13, color: '#64748B' }}>
                  유효 채점 {targetStats.effectiveWeight}표 (제출 {targetStats.rawVoteCount}건)
                </div>
              </div>
            </>
          ) : isNerae && pendingAssign ? (
            <p style={{ textAlign: 'center', color: '#64748B', fontSize: 14, marginBottom: 12 }}>
              아직 제출된 채점이 없습니다. 등급은 직접 선택해 부여할 수 있습니다.
            </p>
          ) : null}

          {isNerae && pendingAssign && (
            <div style={{ maxWidth: 360, margin: '0 auto' }}>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>부여할 등급</label>
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #CBD5E1' }}
              >
                <option value="">선택</option>
                {GRADES_FOR_ADMIN_SELECT.filter((g) => g !== '🌌').map((emoji) => (
                  <option key={emoji} value={emoji}>
                    {emoji} {GRADE_NAMES[emoji]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedGrade || assigning}
                onClick={() => void handleAssignGrade()}
                style={{
                  marginTop: 12,
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#059669',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: assigning ? 'wait' : 'pointer',
                }}
              >
                등급 부여
              </button>
            </div>
          )}
        </div>
      )}

      {pendingAssign && !isNerae && (
        <p style={{ textAlign: 'center', color: '#64748B', fontSize: 14, marginTop: 8 }}>
          채점이 마감되었습니다. 너래 등급 부여를 기다려 주세요.
        </p>
      )}

      {isNerae && memberSubmissionsForNerae.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 12,
            background: '#FFFBEB',
            border: '1px solid #FDE68A',
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, color: '#92400E', marginBottom: 10 }}>
            멤버 채점·코멘트 (너래만 표시)
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {memberSubmissionsForNerae.map((row) => {
              const scoreLabel = Number.isFinite(row.score) ? `${row.score}점` : '—';
              const gradeHint =
                Number.isFinite(row.score) && row.score >= 0 && row.score <= 100
                  ? getContestGradeFromScore(row.score)
                  : '';
              return (
                <li
                  key={row.evaluator}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#fff',
                    border: '1px solid #FEF3C7',
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#334155', fontSize: 14 }}>
                    {row.evaluator}
                    <span style={{ marginLeft: 8, color: '#6D28D9' }}>{scoreLabel}</span>
                    {gradeHint ? (
                      <span style={{ marginLeft: 6, fontWeight: 600, fontSize: 13, color: '#7C3AED' }}>
                        {gradeHint}
                      </span>
                    ) : null}
                  </div>
                  {row.comment ? (
                    <div style={{ marginTop: 6, fontSize: 13, color: '#475569', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {row.comment}
                    </div>
                  ) : (
                    <div style={{ marginTop: 4, fontSize: 12, color: '#94A3B8' }}>코멘트 없음</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default EvaluationGradeBattleSection;
