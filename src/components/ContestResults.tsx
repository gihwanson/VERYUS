import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import { contestTypeLabel, type RoundDoc, type RoundVote } from '../types/contest';
import {
  getContestGradeEmojiFromScore,
  getContestGradeFromScore,
  pickApplyContestMean,
} from '../utils/contestGrade';
import { applyMemberGradeInAdminPanel } from '../utils/userGradeSync';
import { commentsFromContestGrades, saveContestGradeHistory } from '../utils/contestGradeHistory';
import {
  contestBothMainUids,
  contestStageRoles,
  formatContestStageInline,
  formatContestStageLines,
} from '../utils/contestStage';
import type { ClusterMeanBreakdown, ContestScoreBinScoreEntry } from '../utils/contestScoreAggregation';
import {
  buildContestAggregationContext,
  computeContestTop3Targets,
  rankContestTargets,
  type ContestAggregationContext,
} from '../utils/contestGradesAggregation';
import { CONTEST_EVALUATOR_VOTE_WEIGHT, formatContestWeight } from '../utils/contestVoteWeight';
import { GRADE_NAMES, GRADE_SYSTEM } from './AdminTypes';
import { parseRoundVoteFromDoc } from '../utils/contestParticipant';
import { db } from '../firebase';
import '../styles/contest-ui-refresh.css';

const contestResultsDetailColgroup = (
  <colgroup>
    <col className="contest-results-col-evaluator" />
    <col className="contest-results-col-target" />
    <col className="contest-results-col-score" />
    <col className="contest-results-col-comment" />
  </colgroup>
);

const ContestResults: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contest, setContest] = useState<any>(null);
  const [grades, setGrades] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [evaluationTargets, setEvaluationTargets] = useState<any[]>([]); // 평가받는 대상 (참가자 관리에서 설정한 멤버들)
  const [selectedEvaluator, setSelectedEvaluator] = useState<string>('');
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [resultsMainTab, setResultsMainTab] = useState<'rank' | 'cluster'>('rank');
  const [evaluatorGradeByNickname, setEvaluatorGradeByNickname] = useState<Record<string, string>>({});
  const [memberUsers, setMemberUsers] = useState<Array<{ uid: string; nickname: string; grade: string }>>([]);
  const [applyingGrades, setApplyingGrades] = useState(false);
  const [applyResultMsg, setApplyResultMsg] = useState('');
  const [rounds, setRounds] = useState<RoundDoc[]>([]);
  const [roundVotesMap, setRoundVotesMap] = useState<Record<string, RoundVote[]>>({});
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isAdmin = user && ['리더', '운영진', '부운영진'].includes(user.role);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'contests', id)).then(snap => setContest(snap.exists() ? { id: snap.id, ...snap.data() } : null));
    // 전체 심사결과 불러오기
    getDocs(collection(db, 'contests', id, 'grades')).then(snap => setGrades(snap.docs.map(doc => doc.data())));
    // 팀/참가자 정보도 불러오기
    getDocs(collection(db, 'contests', id, 'teams')).then(snap => setTeams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    getDocs(collection(db, 'contests', id, 'participants')).then(snap => setParticipants(snap.docs.map(doc => doc.data())));
    // 평가받는 대상 불러오기 (참가자 관리에서 설정한 멤버들)
    getDocs(collection(db, 'contests', id, 'evaluationTargets')).then(snap => setEvaluationTargets(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }))));
    getDocs(collection(db, 'users')).then((snap) => {
      const map: Record<string, string> = {};
      const list: Array<{ uid: string; nickname: string; grade: string }> = [];
      snap.forEach((d) => {
        const data = d.data();
        const nick = String(data.nickname || '').trim();
        if (nick) {
          map[nick] = data.grade ?? '';
          list.push({ uid: d.id, nickname: nick, grade: String(data.grade ?? '') });
        }
      });
      setEvaluatorGradeByNickname(map);
      setMemberUsers(list);
    });
  }, [id]);

  useEffect(() => {
    if (!id || !contest || contest.type !== '라운드매치') return;
    const loadRounds = async () => {
      const roundsSnap = await getDocs(
        query(collection(db, 'contests', id, 'rounds'), orderBy('roundNumber', 'asc'))
      );
      const roundsData = roundsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as RoundDoc[];
      setRounds(roundsData);
      const map: Record<string, RoundVote[]> = {};
      await Promise.all(
        roundsSnap.docs.map(async (r) => {
          const votesSnap = await getDocs(collection(db, 'contests', id, 'rounds', r.id, 'votes'));
          map[r.id] = votesSnap.docs.map((d) => parseRoundVoteFromDoc(d.id, d.data()));
        })
      );
      setRoundVotesMap(map);
    };
    void loadRounds();
  }, [id, contest]);

  const contestAggregation = useMemo(
    () => buildContestAggregationContext(grades, evaluatorGradeByNickname),
    [grades, evaluatorGradeByNickname]
  );

  const subAdminGrades = useMemo(
    () => grades.filter((g: { evaluatorRole?: string }) => g.evaluatorRole === '부운영진'),
    [grades]
  );

  const subAdminAggregation = useMemo(
    () => buildContestAggregationContext(subAdminGrades, evaluatorGradeByNickname),
    [subAdminGrades, evaluatorGradeByNickname]
  );

  useEffect(() => {
    if (!id || !contest || contest.type === '라운드매치') return;
    if (!user || user.role !== '리더') return;
    if (grades.length === 0) return;
    const nickOf = (uid: string) => {
      const evalTarget = evaluationTargets.find((et: { uid: string; nickname?: string }) => et.uid === uid);
      if (evalTarget?.nickname) return evalTarget.nickname;
      const solo = participants.find((p: { uid?: string; nickname?: string }) => p.uid === uid);
      if (solo?.nickname) return solo.nickname;
      const member = memberUsers.find((item) => item.uid === uid);
      if (member?.nickname) return member.nickname;
      return uid;
    };
    const top3 = computeContestTop3Targets(grades, evaluatorGradeByNickname).map((item, idx) => {
      const team = teams.find((t: { id: string }) => t.id === item.target);
      const name = team
        ? formatContestStageInline(team, nickOf) || String(team.teamName || item.target)
        : nickOf(item.target);
      return { rank: idx + 1, name, score: Math.round(item.avg * 10) / 10 };
    });
    const prev = Array.isArray(contest.top3) ? contest.top3 : [];
    const unchanged =
      prev.length === top3.length &&
      prev.every(
        (row: { rank?: number; name?: string; score?: number }, i: number) =>
          row.rank === top3[i].rank &&
          row.name === top3[i].name &&
          Number(row.score) === top3[i].score
      );
    if (unchanged) return;
    updateDoc(doc(db, 'contests', id), { top3 }).catch((error) => {
      console.error('순위 재집계 저장 실패:', error);
    });
  }, [
    id,
    contest,
    grades,
    teams,
    participants,
    evaluationTargets,
    memberUsers,
    evaluatorGradeByNickname,
    user?.role,
  ]);

  if (!contest) {
    return (
      <div className="contest-ui-refresh contest-results-container contest-participate-state-screen">
        <div className="contest-participate-state-card contest-participate-state-card--loading">
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <div className="contest-participate-state-msg contest-participate-state-msg--loading">
            콘테스트 정보를 불러오는 중...
          </div>
        </div>
      </div>
    );
  }

  if (!user || user.role !== '리더') {
    return (
      <div className="contest-ui-refresh contest-access-block-screen">
        <div className="contest-access-block-card">
          <div className="contest-access-block-icon" aria-hidden>
            🚫
          </div>
          <h2 className="contest-access-block-title">결과 열람 제한</h2>
          <p className="contest-access-block-message">콘테스트 결과는 리더만 확인할 수 있습니다.</p>
          <button type="button" className="contest-back-button" onClick={() => navigate(`/contests/${id}`)}>
            ← 콘테스트 상세로
          </button>
        </div>
      </div>
    );
  }

  if (contest.type === '라운드매치') {
    return (
      <div className="contest-results-container contest-ui-refresh">
        <div className="contest-results-bg-pattern" aria-hidden />
        <div className="contest-results-content">
          <button type="button" className="contest-back-button" onClick={() => navigate(`/contests/${id}`)}>
            ← 콘테스트 상세로
          </button>
          <div className="contest-results-panel contest-results-hero-panel">
            <h2 className="contest-results-title">{contest.title}</h2>
            <p className="contest-results-subtitle">라운드매치 히스토리 · 리더 전용</p>
          </div>
          {rounds.length === 0 ? (
            <p className="contest-empty-state">기록된 라운드가 없습니다.</p>
          ) : (
            rounds.map((round) => (
              <div key={round.id} className="contest-results-panel" style={{ marginBottom: 20 }}>
                <h3 className="contest-results-round-title">
                  라운드 {round.roundNumber}: {round.teamAName} vs {round.teamBName}
                </h3>
                {round.status === 'published' ? (
                  <p className="contest-results-round-meta contest-results-round-meta--strong">
                    결과: {round.winnerTeamName}
                    {round.votesA != null && (
                      <span className="contest-results-round-meta" style={{ marginLeft: 8 }}>
                        ({round.teamAName} {round.votesA}표 / {round.teamBName} {round.votesB}표)
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="contest-results-round-meta">
                    {round.status === 'voting' ? '진행 중' : '마감 · 미공개'}
                  </p>
                )}
                {(roundVotesMap[round.id] || []).length > 0 && (
                  <table className="contest-results-detail-table" style={{ width: '100%', marginTop: 12 }}>
                    <thead>
                      <tr>
                        <th>참가자</th>
                        <th>선택</th>
                        <th>코멘트</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(roundVotesMap[round.id] || []).map((v, idx) => (
                        <tr key={idx}>
                          <td>{v.nickname}</td>
                          <td>{v.choice === 'A' ? round.teamAName : round.teamBName}</td>
                          <td>{v.comment || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // 등급 계산 함수
  const getGrade = getContestGradeFromScore;

  const nicknameOfUid = (uid: string) => {
    const evalTarget = evaluationTargets.find((et) => et.uid === uid);
    if (evalTarget?.nickname) return evalTarget.nickname;
    const solo = participants.find((p) => p.uid === uid);
    if (solo?.nickname) return solo.nickname;
    if (uid.startsWith('target_') || uid.startsWith('custom_')) {
      const parts = uid.split('_');
      if (parts.length >= 2) return parts[1];
    }
    return `참가자_${uid.slice(-4)}`;
  };

  // 피평가자 표시 함수
  const getTargetDisplay = (target: string) => {
    const team = teams.find(t => t.id === target);
    if (team) {
      const inline = formatContestStageInline(team, nicknameOfUid);
      if (inline) return inline;
      const memberNames = Array.isArray(team.members)
        ? team.members.map((uid: string) => nicknameOfUid(uid)).join(' & ')
        : '';
      return memberNames || `팀 (${team.members?.length || 0}명)`;
    }

    return nicknameOfUid(target);
  };

  const getStageLines = (target: string) => {
    const team = teams.find((item) => item.id === target);
    if (!team) return null;
    return formatContestStageLines(team, nicknameOfUid);
  };

  const buildSortedParticipantRows = (ctx: ContestAggregationContext) =>
    Object.entries(ctx.byTarget)
      .map(([target, data]) => {
        const avg = data.overallMean ?? 0;
        const stageLines = getStageLines(target);
        const applyScore = pickApplyContestMean(data.overallMean, data.clusterMean);
        return {
          target,
          display: stageLines?.title || getTargetDisplay(target),
          support: stageLines?.support || '',
          bothMains: Boolean(stageLines?.bothMains),
          avg,
          clusterAvg: data.clusterMean,
          count: data.rawVoteCount,
          effectiveWeight: data.effectiveWeight,
          grade: data.overallMean != null ? getGrade(data.overallMean) : '',
          clusterGrade: data.clusterMean != null ? getGrade(data.clusterMean) : '',
          applyScore,
          applyGrade: applyScore != null ? getGrade(applyScore) : '',
          comments: data.comments.join(', '),
          clusterBreakdown: data.clusterBreakdown,
        };
      })
      .sort((a, b) => {
        const aScore = a.applyScore ?? a.avg;
        const bScore = b.applyScore ?? b.avg;
        if (bScore !== aScore) return bScore - aScore;
        return b.avg - a.avg;
      });

  type ParticipantRankRow = {
    target: string;
    display: string;
    support: string;
    bothMains: boolean;
    avg: number;
    clusterAvg: number | null;
    count: number;
    effectiveWeight: number;
    grade: string;
    clusterGrade: string;
    applyScore: number | null;
    applyGrade: string;
    comments: string;
    clusterBreakdown: ClusterMeanBreakdown;
  };

  const formatScoreEntriesLabel = (entries: ContestScoreBinScoreEntry[]) =>
    entries
      .map((e) =>
        e.weight !== 1 ? `${e.score}(×${formatContestWeight(e.weight)})` : `${e.score}`
      )
      .join(', ');

  const formatClusterSumFormula = (entries: ContestScoreBinScoreEntry[]) => {
    if (entries.length === 0) return null;
    const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
    if (totalWeight <= 0) return null;
    const mean = entries.reduce((s, e) => s + e.score * e.weight, 0) / totalWeight;
    const parts = entries.map((e) =>
      e.weight !== 1 ? `${e.score}×${formatContestWeight(e.weight)}` : `${e.score}`
    );
    return `(${parts.join(' + ')}) ÷ ${formatContestWeight(totalWeight)} = ${mean.toFixed(1)}`;
  };

  const voteWeightLegendItems = [
    GRADE_SYSTEM.CHERRY,
    GRADE_SYSTEM.STRAWBERRY,
    GRADE_SYSTEM.CRESCENT,
    GRADE_SYSTEM.APPLE,
    GRADE_SYSTEM.MELON,
    GRADE_SYSTEM.WATERMELON,
    GRADE_SYSTEM.EARTH,
    GRADE_SYSTEM.SATURN,
    GRADE_SYSTEM.SUN,
    GRADE_SYSTEM.GALAXY,
  ];

  const splitCommentList = (comments: string) =>
    comments ? comments.split(',').map((s: string) => s.trim()).filter(Boolean) : [];

  const rankEmojiFor = (rank: number) =>
    rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;

  const rankRowClass = (rank: number) => {
    if (rank === 1) return 'contest-results-row-top1';
    if (rank === 2) return 'contest-results-row-top2';
    if (rank === 3) return 'contest-results-row-top3';
    return '';
  };

  const formatMeanValue = (
    mean: number | null | undefined,
    count: number,
    effectiveWeight: number
  ) => {
    if (mean == null || !Number.isFinite(mean)) return '-';
    return (
      <span className="contest-results-mean-line">
        <strong>{mean.toFixed(1)}</strong>
        <span className="contest-results-count-badge">
          ({count}표 · 가중 {formatContestWeight(effectiveWeight)})
        </span>
      </span>
    );
  };

  const formatGradeCell = (gradeLabel: string) =>
    gradeLabel ? <span className="contest-results-grade-cell">{gradeLabel}</span> : '-';

  const ScoreSummaryCell: React.FC<{
    mean: number | null | undefined;
    count: number;
    effectiveWeight: number;
    grade: string;
    variant?: 'overall' | 'cluster';
  }> = ({ mean, count, effectiveWeight, grade, variant = 'overall' }) => (
    <div
      className={
        variant === 'cluster'
          ? 'contest-results-summary-cell contest-results-summary-cell--cluster'
          : 'contest-results-summary-cell'
      }
    >
      {formatMeanValue(mean, count, effectiveWeight)}
      {formatGradeCell(grade)}
    </div>
  );

  const FinalRankBoard: React.FC<{
    title: string;
    rows: ParticipantRankRow[];
    accent?: 'purple' | 'rose';
    showMeanLegend?: boolean;
  }> = ({ title, rows, accent = 'purple', showMeanLegend }) => (
    <>
      <h3
        className={`contest-results-rank-section-title contest-results-rank-section-title--${accent}`}
      >
        {title}
      </h3>
      <div className={`contest-results-rank-cards contest-results-rank-cards--${accent}`}>
        {rows.map((row, index) => {
          const rank = index + 1;
          const commentList = splitCommentList(row.comments);
          return (
            <article
              key={row.target}
              className={`contest-results-rank-card ${rankRowClass(rank)}`}
            >
              <header className="contest-results-rank-card-head">
                <span className="contest-results-rank-card-rank" aria-label={`${rank}위`}>
                  {rankEmojiFor(rank)}
                </span>
                <div className="contest-results-rank-card-identity">
                  <div className="contest-results-rank-card-name">{row.display}</div>
                  {row.support && (
                    <div className={row.bothMains ? 'contest-results-rank-card-support contest-results-rank-card-support--main' : 'contest-results-rank-card-support'}>{row.support}</div>
                  )}
                  <div className="contest-results-rank-card-meta">
                    평가 {row.count}표 · 유효 가중 {formatContestWeight(row.effectiveWeight)}
                  </div>
                </div>
              </header>
              <div className="contest-results-score-grid">
                <div className="contest-results-score-tile">
                  <div className="contest-results-score-tile-label">전체 평균</div>
                  <div className="contest-results-score-tile-value">
                    {Number.isFinite(row.avg) ? row.avg.toFixed(1) : '-'}
                  </div>
                  <div className="contest-results-score-tile-grade">{row.grade || '-'}</div>
                </div>
                <div className="contest-results-score-tile contest-results-score-tile--cluster">
                  <div className="contest-results-score-tile-label">중심 평균</div>
                  <div className="contest-results-score-tile-value">
                    {row.clusterAvg != null && Number.isFinite(row.clusterAvg)
                      ? row.clusterAvg.toFixed(1)
                      : '-'}
                  </div>
                  <div className="contest-results-score-tile-grade">{row.clusterGrade || '-'}</div>
                </div>
                <div className="contest-results-score-tile contest-results-score-tile--apply">
                  <div className="contest-results-score-tile-label">적용 등급</div>
                  <div className="contest-results-score-tile-value">
                    {row.applyScore != null && Number.isFinite(row.applyScore)
                      ? row.applyScore.toFixed(1)
                      : '-'}
                  </div>
                  <div className="contest-results-score-tile-grade">{row.applyGrade || '-'}</div>
                </div>
              </div>
              {commentList.length > 0 && (
                <div className="contest-results-rank-card-comments">
                  <div className="contest-results-rank-card-comments-label">심사 코멘트</div>
                  <BulletedComments comments={commentList} />
                </div>
              )}
            </article>
          );
        })}
      </div>
      <div className="contest-results-table-scroll contest-results-rank-table-desktop">
        <table className="contest-table contest-results-compact-table contest-results-rank-table">
          <thead>
            <tr>
              <th>순위</th>
              <th>닉네임</th>
              <th>전체 (평균 · 등급)</th>
              <th>중심 (평균 · 등급)</th>
              <th>적용 등급</th>
              <th className="contest-results-col-comment">심사 코멘트</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rank = index + 1;
              const commentList = splitCommentList(row.comments);
              return (
                <tr key={row.target} className={rankRowClass(rank)}>
                  <td className="contest-results-rank-num">{rankEmojiFor(rank)}</td>
                  <td className="contest-results-rank-name">
                    <div>{row.display}</div>
                    {row.support && (
                      <div className={row.bothMains ? 'contest-results-rank-support contest-results-rank-support--main' : 'contest-results-rank-support'}>{row.support}</div>
                    )}
                  </td>
                  <td>
                    <ScoreSummaryCell
                      mean={row.avg}
                      count={row.count}
                      effectiveWeight={row.effectiveWeight}
                      grade={row.grade}
                    />
                  </td>
                  <td>
                    <ScoreSummaryCell
                      mean={row.clusterAvg}
                      count={row.count}
                      effectiveWeight={row.effectiveWeight}
                      grade={row.clusterGrade}
                      variant="cluster"
                    />
                  </td>
                  <td>
                    <ScoreSummaryCell
                      mean={row.applyScore}
                      count={row.count}
                      effectiveWeight={row.effectiveWeight}
                      grade={row.applyGrade}
                    />
                  </td>
                  <td className="contest-results-col-comment">
                    <BulletedComments comments={commentList} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showMeanLegend && (
        <p className="contest-results-mean-legend">
          <strong>전체 평균</strong>은 받은 모든 점수의 가중 평균입니다.{' '}
          <strong>중심 평균</strong>은 등급 가중치 합이 가장 큰 점수대(10점 단위)만 골라
          그 구간을 가중 평균한 값입니다.{' '}
          <strong>적용 등급</strong>은 둘 중 더 낮은 점수로, 보수적으로 잡습니다. 고등급 심사일수록 표의 힘이 큽니다.
        </p>
      )}
    </>
  );

  const ClusterMeanExplainBoard: React.FC<{
    title: string;
    rows: ParticipantRankRow[];
    accent?: 'purple' | 'rose';
  }> = ({ title, rows, accent = 'purple' }) => (
    <>
      <h3
        className={`contest-results-rank-section-title contest-results-rank-section-title--${accent}`}
      >
        {title}
      </h3>
      <p className="contest-results-cluster-intro">
        각 참가자별로 받은 점수를 <strong>10점 단위 구간</strong>으로 나눈 뒤,{' '}
        <strong>등급 가중치 합</strong>이 가장 큰 구간만 골라 그 구간 점수들의{' '}
        <strong>가중 평균</strong>을 중심 평균으로 씁니다. 동률이면 더 낮은 점수대를
        선택합니다.
      </p>
      <ul className="contest-results-weight-legend">
        {voteWeightLegendItems.map((emoji) => (
          <li key={emoji}>
            {emoji} {GRADE_NAMES[emoji]} {formatContestWeight(CONTEST_EVALUATOR_VOTE_WEIGHT[emoji])}
          </li>
        ))}
      </ul>
      <div className="contest-results-cluster-list">
        {rows.map((row, rowIndex) => {
          const bd = row.clusterBreakdown;
          const maxBinCount = bd.bins.reduce((m, b) => Math.max(m, b.count), 0);
          return (
            <details
              key={row.target}
              className="contest-results-cluster-detail"
              open={rowIndex === 0}
            >
              <summary className="contest-results-cluster-summary">
                <span className="contest-results-cluster-summary-name">
                  {row.display}
                  {row.support ? ` · ${row.support}` : ''}
                </span>
                <span className="contest-results-cluster-summary-mean">
                  중심 평균{' '}
                  <strong>
                    {row.clusterAvg != null && Number.isFinite(row.clusterAvg)
                      ? row.clusterAvg.toFixed(1)
                      : '-'}
                  </strong>
                  {row.clusterGrade ? ` · ${row.clusterGrade}` : ''}
                </span>
              </summary>
              <div className="contest-results-cluster-body">
                {bd.reason === 'empty' && (
                  <p className="contest-results-cluster-empty">받은 평가가 없습니다.</p>
                )}
                {bd.reason === 'single' && (
                  <>
                    <p className="contest-results-cluster-lead">{bd.tieNote}</p>
                    <p className="contest-results-cluster-lead">
                      사용 점수:{' '}
                      <strong>{formatScoreEntriesLabel(bd.clusterScoreEntries)}</strong>
                    </p>
                    {formatClusterSumFormula(bd.clusterScoreEntries) && (
                      <p className="contest-results-cluster-formula">
                        {formatClusterSumFormula(bd.clusterScoreEntries)}
                      </p>
                    )}
                  </>
                )}
                {bd.reason === 'mode_bin' && bd.selectedBinLabel && (
                  <>
                    <p className="contest-results-cluster-lead">
                      유효 <strong>{bd.totalVotes}표</strong>(가중 합{' '}
                      {formatContestWeight(bd.totalEffectiveWeight)}) 중{' '}
                      <strong>
                        가중 {formatContestWeight(bd.bins.find((b) => b.isSelected)?.count ?? 0)}
                      </strong>
                      이 <strong>{bd.selectedBinLabel}</strong> 구간에 모였습니다. 이 구간만
                      가중 평균 냈습니다.
                    </p>
                    {bd.tieNote && (
                      <p className="contest-results-cluster-tie">{bd.tieNote}</p>
                    )}
                    <div className="contest-results-cluster-bins" aria-label="구간별 표 분포">
                      {bd.bins.map((bin) => (
                        <div
                          key={bin.binStart}
                          className={
                            bin.isSelected
                              ? 'contest-results-cluster-bin contest-results-cluster-bin--selected'
                              : bin.tiedForMax
                                ? 'contest-results-cluster-bin contest-results-cluster-bin--tied'
                                : 'contest-results-cluster-bin'
                          }
                        >
                          <div className="contest-results-cluster-bin-head">
                            <span className="contest-results-cluster-bin-label">
                              {bin.label}
                              {bin.isSelected ? ' ✓' : ''}
                            </span>
                            <span className="contest-results-cluster-bin-count">
                              {bin.rawVoteCount}표 · 가중 {formatContestWeight(bin.count)}
                            </span>
                          </div>
                          <div className="contest-results-cluster-bin-bar-track">
                            <div
                              className="contest-results-cluster-bin-bar-fill"
                              style={{
                                width: `${maxBinCount > 0 ? (bin.count / maxBinCount) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <div className="contest-results-cluster-bin-scores">
                            점수: {formatScoreEntriesLabel(bin.scoreEntries) || '-'}
                          </div>
                        </div>
                      ))}
                    </div>
                    {formatClusterSumFormula(bd.clusterScoreEntries) && (
                      <p className="contest-results-cluster-formula">
                        {formatClusterSumFormula(bd.clusterScoreEntries)}
                      </p>
                    )}
                  </>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </>
  );

  const sortedParticipants = buildSortedParticipantRows(contestAggregation);
  const subAdmins = subAdminGrades;
  const sortedSubAdminParticipants = buildSortedParticipantRows(subAdminAggregation);

  const resolveMembersForTarget = (target: string) => {
    const found: Array<{ uid: string; nickname: string }> = [];
    const pushUnique = (uid: string, nickname: string) => {
      if (!uid || found.some((item) => item.uid === uid)) return;
      found.push({ uid, nickname });
    };
    const mainUidsOfTeam = (team: { members?: string[]; mainUid?: string }) => {
      const bothMains = contestBothMainUids(team);
      if (bothMains && bothMains.length > 0) return bothMains;
      const roles = contestStageRoles(team);
      if (roles?.mainUids?.length) return roles.mainUids;
      if (team.mainUid) return [team.mainUid];
      return [];
    };
    const team = teams.find((item) => item.id === target);
    const candidateIds = (() => {
      if (team) return mainUidsOfTeam(team);
      const parentTeam = teams.find((item) => (item.members || []).includes(target));
      if (parentTeam) {
        return mainUidsOfTeam(parentTeam).includes(target) ? [target] : [];
      }
      return [target];
    })();
    for (const candidate of candidateIds) {
      const byUid = memberUsers.find((u) => u.uid === candidate);
      if (byUid) {
        pushUnique(byUid.uid, byUid.nickname);
        continue;
      }
      const nick = nicknameOfUid(candidate);
      const byNick = memberUsers.find(
        (u) => u.nickname === nick || u.nickname === candidate
      );
      if (byNick) pushUnique(byNick.uid, byNick.nickname);
    }
    return found;
  };

  const handleApplyResultGrades = async () => {
    const assignments: Array<{
      uid: string;
      nickname: string;
      grade: string;
      score: number;
      overallMean: number | null;
      clusterMean: number | null;
      comments: ReturnType<typeof commentsFromContestGrades>;
      targetLabel: string;
      rank: number | null;
      rankedCount: number | null;
    }> = [];
    const skipped: string[] = [];
    const rankedRows = rankContestTargets(contestAggregation);
    const rankedCount = rankedRows.length;
    const rankByTarget = new Map(rankedRows.map((item) => [item.target, item.rank]));
    for (const row of sortedParticipants) {
      if (row.applyScore == null || !row.applyGrade) {
        skipped.push(row.display);
        continue;
      }
      const members = resolveMembersForTarget(row.target);
      if (members.length === 0) {
        skipped.push(row.display);
        continue;
      }
      const comments = commentsFromContestGrades(grades, row.target);
      const targetData = contestAggregation.byTarget[row.target];
      for (const member of members) {
        if (assignments.some((item) => item.uid === member.uid)) continue;
        assignments.push({
          uid: member.uid,
          nickname: member.nickname,
          grade: row.applyGrade,
          score: row.applyScore,
          overallMean: targetData?.overallMean ?? row.avg ?? null,
          clusterMean: targetData?.clusterMean ?? row.clusterAvg ?? null,
          comments,
          targetLabel: row.display,
          rank: rankByTarget.get(row.target) ?? null,
          rankedCount,
        });
      }
    }
    if (assignments.length === 0) {
      alert('적용할 회원 등급이 없습니다. 회원 닉네임이 맞는지 확인해 주세요.');
      return;
    }
    const preview = assignments
      .map((item) => `${item.nickname}: ${item.grade} (${item.score.toFixed(1)}점)`)
      .join('\n');
    const skipText = skipped.length > 0 ? `\n\n건너뜀: ${skipped.join(', ')}` : '';
    if (
      !window.confirm(
        `전체평균·중심평균 중 더 낮은 점수로 아래 등급을 관리자 패널(회원 등급)에 적용합니다.\n\n${preview}${skipText}\n\n계속할까요?`
      )
    ) {
      return;
    }
    setApplyingGrades(true);
    setApplyResultMsg('');
    try {
      for (const item of assignments) {
        await applyMemberGradeInAdminPanel(item.uid, item.grade);
        if (id) {
          await saveContestGradeHistory(item.uid, {
            contestId: id,
            contestTitle: String(contest.title || '등급전'),
            contestType: String(contest.type || '경연'),
            appliedGrade: item.grade,
            appliedScore: item.score,
            overallMean: item.overallMean,
            clusterMean: item.clusterMean,
            comments: item.comments,
            targetLabel: item.targetLabel,
            rank: item.rank,
            rankedCount: item.rankedCount,
          });
        }
      }
      if (id) {
        await updateDoc(doc(db, 'contests', id), {
          gradesAppliedAt: serverTimestamp(),
          gradesAppliedCount: assignments.length,
        });
      }
      setEvaluatorGradeByNickname((prev) => {
        const next = { ...prev };
        for (const item of assignments) {
          next[item.nickname] = item.grade;
        }
        return next;
      });
      setApplyResultMsg(`${assignments.length}명 등급을 적용했습니다.`);
    } catch (error) {
      console.error('등급 적용 실패:', error);
      alert('등급 적용 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setApplyingGrades(false);
    }
  };

  // 고유 평가자 목록 생성
  const uniqueEvaluators = Array.from(new Set(grades.map(g => g.evaluator))).sort();
  
  // 고유 피평가자 목록 생성
  const uniqueTargets = Array.from(new Set(grades.map(g => g.target)))
    .map(target => ({ id: target, display: getTargetDisplay(target) }))
    .sort((a, b) => a.display.localeCompare(b.display));

  // 필터링된 평가 데이터
  const filteredGrades = grades.filter(g => {
    const matchEvaluator = !selectedEvaluator || g.evaluator === selectedEvaluator;
    const matchTarget = !selectedTarget || g.target === selectedTarget;
    return matchEvaluator && matchTarget;
  });

  // 필터 초기화 함수
  const resetFilters = () => {
    setSelectedEvaluator('');
    setSelectedTarget('');
  };

  // 불릿+줄바꿈+더보기 코멘트 컴포넌트
  const BulletedComments: React.FC<{ comments: string[] }> = ({ comments }) => {
    const [expanded, setExpanded] = useState(false);
    const MAX_LINES = 3;
    if (!comments || comments.length === 0) return null;
    const showExpand = comments.length > MAX_LINES;
    const shown = expanded ? comments : comments.slice(0, MAX_LINES);
    return (
      <div style={{ 
        whiteSpace: 'pre-line', 
        lineHeight: 1.6,
        userSelect: 'text',
        WebkitUserSelect: 'text',
        MozUserSelect: 'text',
        msUserSelect: 'text',
        minWidth: 0,
        overflow: 'visible',
      }}>
        {shown.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 4, minWidth: 0 }}>
            <span style={{ color: '#8A55CC', fontWeight: 'bold', fontSize: 16, flexShrink: 0 }}>•</span>
            <span style={{ 
              color: 'var(--text-primary, #333)',
              flex: '1 1 auto',
              minWidth: 0,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              userSelect: 'text',
              WebkitUserSelect: 'text',
              MozUserSelect: 'text',
              msUserSelect: 'text'
            }}>{c}</span>
          </div>
        ))}
        {showExpand && (
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              background: 'none',
              border: 'none',
              color: '#7C4DBC',
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
              marginTop: 4,
              fontSize: 13,
              textDecoration: 'underline',
            }}
          >
            {expanded ? '접기 ▲' : `더보기 ▼`}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="contest-results-container contest-ui-refresh">
      <div className="contest-results-bg-pattern" aria-hidden />

      <div className="contest-results-content">
        <button type="button" className="contest-back-button" onClick={() => navigate(`/contests/${id}`)}>
          ← 콘테스트 상세로
        </button>

        <div className="contest-results-panel contest-results-hero-panel">
          <h2 className="contest-results-title">{contest.title}</h2>
          <p className="contest-results-subtitle">{contestTypeLabel(contest.type)} · 최종 결과</p>
        </div>
      <div className="contest-results-panel">
        <div
          className="contest-results-main-tabs"
          role="tablist"
          aria-label="최종 결과 보기"
        >
          <button
            type="button"
            role="tab"
            aria-selected={resultsMainTab === 'rank'}
            className={
              resultsMainTab === 'rank'
                ? 'contest-results-main-tab contest-results-main-tab--active'
                : 'contest-results-main-tab'
            }
            onClick={() => setResultsMainTab('rank')}
          >
            순위 결과
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={resultsMainTab === 'cluster'}
            className={
              resultsMainTab === 'cluster'
                ? 'contest-results-main-tab contest-results-main-tab--active'
                : 'contest-results-main-tab'
            }
            onClick={() => setResultsMainTab('cluster')}
          >
            중심 평균 산출 근거
          </button>
        </div>
        {resultsMainTab === 'rank' ? (
          <>
          <FinalRankBoard
            title="🏆 최종 등급 결과 (적용 점수 순)"
            rows={sortedParticipants}
            accent="purple"
            showMeanLegend
          />
          {sortedParticipants.length > 0 && (
            <div className="contest-results-apply-box">
              <p className="contest-results-apply-help">
                적용 등급은 전체 평균과 중심 평균 중 <strong>더 낮은 점수</strong>로 계산하며,
                <strong>메인 인원만</strong> 관리자 패널 등급이 바뀝니다. 서브는 적용되지 않습니다.
                적용된 등급·점수·심사 코멘트는 각 인원 마이페이지의 <strong>등급전</strong> 탭에 본인만 보입니다.
              </p>
              <button
                type="button"
                className="contest-results-apply-btn"
                onClick={() => void handleApplyResultGrades()}
                disabled={applyingGrades}
              >
                {applyingGrades ? '적용 중...' : '적용하기'}
              </button>
              {applyResultMsg ? (
                <p className="contest-results-apply-done">{applyResultMsg}</p>
              ) : null}
            </div>
          )}
          </>
        ) : (
          <ClusterMeanExplainBoard
            title="📊 중심 평균 산출 근거 (전체 평가)"
            rows={sortedParticipants}
            accent="purple"
          />
        )}
        {contest.type === '경연' && resultsMainTab === 'rank' && (
          <div style={{
            background: 'rgba(138, 85, 204, 0.1)',
            border: '1px solid rgba(138, 85, 204, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            marginTop: '16px',
            textAlign: 'center'
          }}>
            <div style={{ color: '#7C4DBC', fontWeight: 700, fontSize: '16px', marginBottom: '8px' }}>
              🎭 경연 결과 안내
            </div>
            <div style={{ color: '#6B21A8', fontSize: '14px', lineHeight: '1.6' }}>
              경연은 참가자 상호 평가 방식으로 진행되었습니다.<br />
              위 순위는 모든 참가자들의 평가 점수를 평균내어 결정되었습니다.
            </div>
          </div>
        )}
      </div>
      {grades.length > 0 && (
        <div className="contest-results-panel">
          <h3 style={{ color: '#7C4DBC', fontWeight: 700, fontSize: 18, marginBottom: 12, textAlign: 'center', borderTop: '2px solid #E5DAF5', paddingTop: 16 }}>전체 심사결과</h3>
          
          {/* 필터링 UI */}
          <div className="contest-results-filter" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontWeight: 600, color: '#7C4DBC', minWidth: 60 }}>평가자:</label>
              <select
                value={selectedEvaluator}
                onChange={e => setSelectedEvaluator(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #E5DAF5', fontSize: 14, minWidth: 120 }}
              >
                <option value="">전체</option>
                {uniqueEvaluators.map(evaluator => (
                  <option key={evaluator} value={evaluator}>{evaluator}</option>
                ))}
              </select>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontWeight: 600, color: '#7C4DBC', minWidth: 70 }}>피평가자:</label>
              <select
                value={selectedTarget}
                onChange={e => setSelectedTarget(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #E5DAF5', fontSize: 14, minWidth: 150 }}
              >
                <option value="">전체</option>
                {uniqueTargets.map(target => (
                  <option key={target.id} value={target.id}>{target.display}</option>
                ))}
              </select>
            </div>
            
            <button
              onClick={resetFilters}
              style={{ 
                background: '#F43F5E', 
                color: '#fff', 
                border: 'none', 
                borderRadius: 6, 
                padding: '6px 16px', 
                fontWeight: 600, 
                fontSize: 14, 
                cursor: 'pointer' 
              }}
            >
              필터 초기화
            </button>
          </div>

          {/* 필터 상태 표시 */}
          {(selectedEvaluator || selectedTarget) && (
            <div style={{ marginBottom: 12, padding: 8, background: '#F0F9FF', borderRadius: 6, border: '1px solid #BAE6FD', textAlign: 'center' }}>
              <span style={{ color: '#0369A1', fontWeight: 600, fontSize: 14 }}>
                필터 적용 중: 
                {selectedEvaluator && ` 평가자(${selectedEvaluator})`}
                {selectedEvaluator && selectedTarget && ' + '}
                {selectedTarget && ` 피평가자(${getTargetDisplay(selectedTarget)})`}
                {' '}| 총 {filteredGrades.length}개 결과
              </span>
            </div>
          )}

          <div className="contest-results-table-scroll">
          <table className="contest-table contest-results-detail-table">
            {contestResultsDetailColgroup}
            <thead>
              <tr style={{ background: '#F6F2FF', color: '#8A55CC' }}>
                <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>평가자</th>
                <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>피평가자</th>
                <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>점수</th>
                <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>심사코멘트</th>
              </tr>
            </thead>
            <tbody>
              {filteredGrades.map((g, i) => (
                <tr key={i}>
                  <td className="contest-results-evaluator-td" style={{ border: '1px solid #E5DAF5', color: 'var(--text-primary, #333)' }} title={g.evaluator}>{g.evaluator}</td>
                  <td className="contest-results-target-td" style={{ border: '1px solid #E5DAF5', color: 'var(--text-primary, #333)' }} title={getTargetDisplay(g.target)}>{getTargetDisplay(g.target)}</td>
                  <td className="contest-results-score-td" style={{ border: '1px solid #E5DAF5', color: 'var(--text-primary, #333)' }}>
                    <div className="contest-results-score-cell">
                      <span className="contest-results-score-num">{g.score}</span>
                      <span
                        className="contest-results-inline-grade"
                        title={getGrade(Number(g.score))}
                        aria-label={getGrade(Number(g.score))}
                      >
                        {getContestGradeEmojiFromScore(Number(g.score))}
                      </span>
                    </div>
                  </td>
                  <td className="contest-results-comment-td" style={{ border: '1px solid #E5DAF5', color: 'var(--text-primary, #333)', userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text', msUserSelect: 'text' }}>
                    <BulletedComments comments={g.comment ? g.comment.split(',').map((s: string) => s.trim()).filter(Boolean) : []} />
                  </td>
                </tr>
              ))}
              {filteredGrades.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 16, textAlign: 'center', color: '#9CA3AF', fontStyle: 'italic' }}>
                    선택한 조건에 맞는 평가 결과가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          {/* 부운영진 평가 결과 별도 표 */}
          {subAdmins.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <h3 style={{ color: '#F43F5E', fontWeight: 700, fontSize: 18, marginBottom: 12, textAlign: 'center', borderTop: '2px solid #F43F5E', paddingTop: 16 }}>부운영진 평가 결과</h3>
              <div className="contest-results-table-scroll">
              <table className="contest-table contest-results-detail-table">
                {contestResultsDetailColgroup}
                <thead>
                  <tr style={{ background: '#F6F2FF', color: '#F43F5E' }}>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>부운영진</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>피평가자</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>점수</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>심사코멘트</th>
                  </tr>
                </thead>
                <tbody>
                  {subAdmins.map((g, i) => (
                    <tr key={i}>
                      <td className="contest-results-evaluator-td" style={{ border: '1px solid #E5DAF5', color: 'var(--text-primary, #333)' }} title={g.evaluator}>{g.evaluator}</td>
                      <td className="contest-results-target-td" style={{ border: '1px solid #E5DAF5', color: 'var(--text-primary, #333)' }} title={getTargetDisplay(g.target)}>{getTargetDisplay(g.target)}</td>
                      <td className="contest-results-score-td" style={{ border: '1px solid #E5DAF5', color: 'var(--text-primary, #333)' }}>
                        <div className="contest-results-score-cell">
                          <span className="contest-results-score-num">{g.score}</span>
                          <span
                            className="contest-results-inline-grade"
                            title={getGrade(Number(g.score))}
                            aria-label={getGrade(Number(g.score))}
                          >
                            {getContestGradeEmojiFromScore(Number(g.score))}
                          </span>
                        </div>
                      </td>
                      <td className="contest-results-comment-td" style={{ border: '1px solid #E5DAF5', color: 'var(--text-primary, #333)', userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text', msUserSelect: 'text' }}>
                        <BulletedComments comments={g.comment ? g.comment.split(',').map((s: string) => s.trim()).filter(Boolean) : []} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {/* 부운영진 기준 최종 등급 결과 표 */}
              <div className="contest-results-subadmin-rank-wrap">
                {resultsMainTab === 'rank' ? (
                  <FinalRankBoard
                    title="🏆 부운영진 기준 최종 등급 결과 (적용 점수 순)"
                    rows={sortedSubAdminParticipants}
                    accent="rose"
                  />
                ) : (
                  <ClusterMeanExplainBoard
                    title="📊 중심 평균 산출 근거 (부운영진 평가만)"
                    rows={sortedSubAdminParticipants}
                    accent="rose"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
        {isAdmin && applyResultMsg ? (
          <div className="contest-results-apply-done contest-results-apply-done--footer">
            {applyResultMsg}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ContestResults; 