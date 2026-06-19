import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { getGradeBadgeLabel } from '../utils/gradeDisplay';
import GlobalLoadingScreen from './GlobalLoadingScreen';
import './HallOfFame.css';
import { approvedSongCountsByNicknameFromDocs } from '../utils/approvedSongMilestone';

type RankEntry = {
  uid: string;
  nickname: string;
  grade?: string;
  role?: string;
  score: number;
};

type UserMap = Record<string, { nickname: string; grade?: string; role?: string }>;
type ScoreWeights = {
  post: number;
  comment: number;
  lurking: number;
};

type HallCachePayload = {
  updatedAt: string;
  scoreWeights: ScoreWeights;
  approvedSongRanking: RankEntry[];
  commentRanking: RankEntry[];
  postRanking: RankEntry[];
  visitRanking: RankEntry[];
  activePeriodRanking: RankEntry[];
  activityRanking: RankEntry[];
};

const MEDALS = ['1', '2', '3'];
const SHOW_HALL_DEBUG_LOG = Boolean(import.meta.env.DEV);
const HALL_CACHE_KEY = 'veryus_hall_of_fame_cache_v1';
const RANKING_INITIAL_VISIBLE = 30;
const RANKING_LOAD_MORE_STEP = 30;

type HallSectionKey = 'activity' | 'approvedSong' | 'comment' | 'post' | 'visit' | 'activePeriod';

const initialVisibleCounts = (): Record<HallSectionKey, number> => ({
  activity: RANKING_INITIAL_VISIBLE,
  approvedSong: RANKING_INITIAL_VISIBLE,
  comment: RANKING_INITIAL_VISIBLE,
  post: RANKING_INITIAL_VISIBLE,
  visit: RANKING_INITIAL_VISIBLE,
  activePeriod: RANKING_INITIAL_VISIBLE
});
const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  post: 10,
  comment: 5,
  lurking: 0.1
};

const HallOfFame: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [scoreWeights, setScoreWeights] = useState<ScoreWeights>(DEFAULT_SCORE_WEIGHTS);
  const [approvedSongRanking, setApprovedSongRanking] = useState<RankEntry[]>([]);
  const [commentRanking, setCommentRanking] = useState<RankEntry[]>([]);
  const [postRanking, setPostRanking] = useState<RankEntry[]>([]);
  const [visitRanking, setVisitRanking] = useState<RankEntry[]>([]);
  const [activePeriodRanking, setActivePeriodRanking] = useState<RankEntry[]>([]);
  const [activityRanking, setActivityRanking] = useState<RankEntry[]>([]);
  const [visibleCountBySection, setVisibleCountBySection] = useState<Record<HallSectionKey, number>>(initialVisibleCounts);

  const toSortedEntries = (counter: Map<string, number>, userMap: UserMap, topLimit = 20): RankEntry[] => {
    const sorted = Array.from(counter.entries())
      .map(([uid, score]) => ({
        uid,
        nickname: userMap[uid]?.nickname || '알 수 없음',
        grade: userMap[uid]?.grade,
        role: userMap[uid]?.role,
        score
      }))
      .sort((a, b) => (b.score - a.score) || a.nickname.localeCompare(b.nickname, 'ko'));
    if (topLimit <= 0) return sorted;
    return sorted.slice(0, topLimit);
  };

  const writeHallCache = (payload: HallCachePayload) => {
    try {
      localStorage.setItem(HALL_CACHE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('명예의전당 캐시 저장 실패:', error);
    }
  };

  const hydrateFromHallCache = (): boolean => {
    try {
      const raw = localStorage.getItem(HALL_CACHE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as HallCachePayload;
      if (!parsed || !Array.isArray(parsed.activityRanking)) return false;
      setUpdatedAt(parsed.updatedAt || '');
      setScoreWeights(parsed.scoreWeights || DEFAULT_SCORE_WEIGHTS);
      setApprovedSongRanking(parsed.approvedSongRanking || []);
      setCommentRanking(parsed.commentRanking || []);
      setPostRanking(parsed.postRanking || []);
      setVisitRanking(parsed.visitRanking || []);
      setActivePeriodRanking(parsed.activePeriodRanking || []);
      setActivityRanking(parsed.activityRanking || []);
      setVisibleCountBySection(initialVisibleCounts());
      return true;
    } catch (error) {
      console.warn('명예의전당 캐시 로드 실패:', error);
      return false;
    }
  };

  const loadRanking = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [usersSnap, postsSnap, commentsSnap, approvedSongsSnap, boardVisitsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'posts')),
        getDocs(collection(db, 'comments')),
        getDocs(collection(db, 'approvedSongs')),
        getDocs(collection(db, 'boardVisits'))
      ]);

      let settingData: Record<string, unknown> = {};
      try {
        const hallSettingSnap = await getDoc(doc(db, 'appSettings', 'hallOfFame'));
        settingData = hallSettingSnap.exists() ? (hallSettingSnap.data() as Record<string, unknown>) : {};
      } catch (settingError) {
        // 설정 문서가 없거나 읽기 권한이 없어도 랭킹은 기본 가중치로 계속 로드한다.
        if (SHOW_HALL_DEBUG_LOG) {
          console.warn('명예의전당 설정 로드 실패(기본 가중치 사용):', settingError);
        }
      }
      const weights: ScoreWeights = {
        post: Number.isFinite(Number(settingData.postWeight)) ? Number(settingData.postWeight) : DEFAULT_SCORE_WEIGHTS.post,
        comment: Number.isFinite(Number(settingData.commentWeight)) ? Number(settingData.commentWeight) : DEFAULT_SCORE_WEIGHTS.comment,
        lurking: Number.isFinite(Number(settingData.lurkingWeight)) ? Number(settingData.lurkingWeight) : DEFAULT_SCORE_WEIGHTS.lurking
      };
      setScoreWeights(weights);

      const userMap: UserMap = {};
      const nicknameToUid = new Map<string, string>();
      const activePeriodCounter = new Map<string, number>();
      const blankNicknameUsers: Array<{ uid: string; grade?: string; role?: string }> = [];

      usersSnap.forEach((userDoc) => {
        const data = userDoc.data() as Record<string, any>;
        const nickname = String(data.nickname || '').trim();
        if (!nickname) {
          blankNicknameUsers.push({
            uid: userDoc.id,
            grade: data.grade,
            role: data.role
          });
        }
        userMap[userDoc.id] = {
          nickname: nickname || '알 수 없음',
          grade: data.grade,
          role: data.role
        };
        const createdAtRaw = data.createdAt;
        const createdAtDate =
          createdAtRaw?.toDate?.() instanceof Date
            ? createdAtRaw.toDate()
            : createdAtRaw
              ? new Date(createdAtRaw)
              : null;
        if (createdAtDate && !Number.isNaN(createdAtDate.getTime())) {
          const diffMs = Date.now() - createdAtDate.getTime();
          const activeDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
          activePeriodCounter.set(userDoc.id, activeDays);
        }
        if (nickname) nicknameToUid.set(nickname, userDoc.id);
      });

      const postCounter = new Map<string, number>();
      const commentCounter = new Map<string, number>();
      const approvedSongCounter = new Map<string, number>();
      const visitCounter = new Map<string, number>();
      const nicknameCandidatesByUid = new Map<string, Map<string, number>>();

      const trackNicknameCandidate = (uid: string, rawNickname: unknown) => {
        const nickname = String(rawNickname || '').trim();
        if (!uid || !nickname || nickname === '익명' || nickname === '알 수 없음') return;
        if (!nicknameCandidatesByUid.has(uid)) {
          nicknameCandidatesByUid.set(uid, new Map<string, number>());
        }
        const bucket = nicknameCandidatesByUid.get(uid)!;
        bucket.set(nickname, (bucket.get(nickname) || 0) + 1);
      };

      postsSnap.forEach((postDoc) => {
        const data = postDoc.data() as Record<string, any>;
        const uid = String(data.writerUid || '').trim();
        if (!uid) return;
        postCounter.set(uid, (postCounter.get(uid) || 0) + 1);
        trackNicknameCandidate(uid, data.writerNickname);
      });

      commentsSnap.forEach((commentDoc) => {
        const data = commentDoc.data() as Record<string, any>;
        if (data.isEvaluatorAliasComment === true) return;
        const wNick = String(data.writerNickname || '').trim();
        if (wNick === '평가자') return;
        const uid = String(data.writerUid || '').trim();
        if (!uid) return;
        commentCounter.set(uid, (commentCounter.get(uid) || 0) + 1);
        trackNicknameCandidate(uid, data.writerNickname);
      });

      approvedSongCountsByNicknameFromDocs(approvedSongsSnap.docs).forEach((count, nickname) => {
        const uid = nicknameToUid.get(nickname);
        if (!uid) return;
        approvedSongCounter.set(uid, count);
      });

      boardVisitsSnap.forEach((visitDoc) => {
        const data = visitDoc.data() as Record<string, any>;
        const uid = String(data.userId || visitDoc.id || '').trim();
        if (!uid) return;
        const lurkingScore = Number(data.lurkingScore);
        if (Number.isFinite(lurkingScore) && lurkingScore > 0) {
          visitCounter.set(uid, Math.round(lurkingScore * 10) / 10);
          return;
        }
        const legacyVisitCount = Number(data.totalVisitCount);
        if (!Number.isFinite(legacyVisitCount) || legacyVisitCount <= 0) return;
        visitCounter.set(uid, Math.round(legacyVisitCount * 10) / 10);
      });

      const filterCounterByExistingUser = (counter: Map<string, number>) =>
        new Map(Array.from(counter.entries()).filter(([uid]) => Boolean(userMap[uid])));

      const filteredPostCounter = filterCounterByExistingUser(postCounter);
      const filteredCommentCounter = filterCounterByExistingUser(commentCounter);
      const filteredApprovedSongCounter = filterCounterByExistingUser(approvedSongCounter);
      const filteredVisitCounter = filterCounterByExistingUser(visitCounter);

      const allUserIds = new Set<string>([
        ...filteredPostCounter.keys(),
        ...filteredCommentCounter.keys(),
        ...filteredApprovedSongCounter.keys(),
        ...filteredVisitCounter.keys()
      ]);
      const activityCounter = new Map<string, number>();
      allUserIds.forEach((uid) => {
        const total =
          (filteredPostCounter.get(uid) || 0) * weights.post +
          (filteredCommentCounter.get(uid) || 0) * weights.comment +
          (filteredVisitCounter.get(uid) || 0) * weights.lurking;
        activityCounter.set(uid, total);
      });

      const missingUsersFromRanking = Array.from(allUserIds)
        .filter((uid) => !userMap[uid])
        .map((uid) => ({
          uid,
          candidateNicknames: Array.from((nicknameCandidatesByUid.get(uid) || new Map<string, number>()).entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([nickname]) => nickname)
            .join(', ') || '(없음)',
          postCount: postCounter.get(uid) || 0,
          commentCount: commentCounter.get(uid) || 0,
          approvedSongCount: approvedSongCounter.get(uid) || 0,
          totalActivity: activityCounter.get(uid) || 0
        }));

      if (SHOW_HALL_DEBUG_LOG && (blankNicknameUsers.length > 0 || missingUsersFromRanking.length > 0)) {
        console.group('[명예의전당] "알 수 없음" 진단');
        if (blankNicknameUsers.length > 0) {
          console.warn('users 컬렉션에 nickname이 비어있는 사용자:', blankNicknameUsers.length);
          console.table(blankNicknameUsers);
        }
        if (missingUsersFromRanking.length > 0) {
          console.warn('활동 데이터에는 있지만 users 컬렉션에 없는 UID:', missingUsersFromRanking.length);
          console.table(missingUsersFromRanking);
        }
        console.groupEnd();
      }

      // 상위 20명 자르면 더보기(30명 초기) 의미 없음 → 전체 정렬 후 UI에서 페이징
      const nextPostRanking = toSortedEntries(filteredPostCounter, userMap, 0);
      const nextCommentRanking = toSortedEntries(filteredCommentCounter, userMap, 0);
      const nextVisitRanking = toSortedEntries(filteredVisitCounter, userMap, 0);
      const nextActivePeriodRanking = toSortedEntries(activePeriodCounter, userMap, 0);
      const nextApprovedSongRanking = toSortedEntries(filteredApprovedSongCounter, userMap, 0);
      const nextActivityRanking = toSortedEntries(activityCounter, userMap, 0);
      const nextUpdatedAt = new Date().toLocaleString('ko-KR');

      setPostRanking(nextPostRanking);
      setCommentRanking(nextCommentRanking);
      setVisitRanking(nextVisitRanking);
      setActivePeriodRanking(nextActivePeriodRanking);
      setApprovedSongRanking(nextApprovedSongRanking);
      setActivityRanking(nextActivityRanking);
      setUpdatedAt(nextUpdatedAt);
      setVisibleCountBySection(initialVisibleCounts());

      writeHallCache({
        updatedAt: nextUpdatedAt,
        scoreWeights: weights,
        approvedSongRanking: nextApprovedSongRanking,
        commentRanking: nextCommentRanking,
        postRanking: nextPostRanking,
        visitRanking: nextVisitRanking,
        activePeriodRanking: nextActivePeriodRanking,
        activityRanking: nextActivityRanking
      });
    } catch (error) {
      console.error('명예의전당 로딩 실패:', error);
      alert('명예의전당 데이터를 불러오지 못했습니다.');
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    const hasCache = hydrateFromHallCache();
    setLoading(!hasCache);
    void loadRanking(!hasCache);
  }, []);

  const formatWeight = (value: number) => (Number.isInteger(value) ? `${value}` : value.toFixed(1));

  const sections = useMemo(
    () =>
      [
        {
          key: 'activity' as const,
          title: '종합 활동 순위',
          subtitle: `게시글(${formatWeight(scoreWeights.post)}점) + 댓글(${formatWeight(scoreWeights.comment)}점) + 눈팅(${formatWeight(scoreWeights.lurking)}점/행동) 합산`,
          ranking: activityRanking,
          unit: '점'
        },
        {
          key: 'approvedSong' as const,
          title: '합격곡 순위',
          subtitle: '합격곡 멤버로 등재된 횟수',
          ranking: approvedSongRanking,
          unit: '개 합격곡'
        },
        {
          key: 'comment' as const,
          title: '댓글 작성 순위',
          subtitle: '작성한 댓글 누적 수',
          ranking: commentRanking,
          unit: '개'
        },
        {
          key: 'post' as const,
          title: '게시글 작성 순위',
          subtitle: '작성한 게시글 누적 수',
          ranking: postRanking,
          unit: '개'
        },
        {
          key: 'visit' as const,
          title: '눈팅 순위',
          subtitle: '게시판 진입/게시글 진입/녹음 재생 누적 점수',
          ranking: visitRanking,
          unit: '점'
        },
        {
          key: 'activePeriod' as const,
          title: '활동기간 순위',
          subtitle: '가입일 기준 활동 경과 기간',
          ranking: activePeriodRanking,
          unit: '일'
        }
      ] satisfies Array<{
        key: HallSectionKey;
        title: string;
        subtitle: string;
        ranking: RankEntry[];
        unit: string;
      }>,
    [activityRanking, approvedSongRanking, commentRanking, postRanking, visitRanking, activePeriodRanking, scoreWeights]
  );

  if (loading) {
    return <GlobalLoadingScreen message="명예의전당을 불러오는 중..." />;
  }

  return (
    <div className="hall-of-fame-page">
      <div className="hall-of-fame-content">
        <div className="hall-header">
          <h2>🏅 명예의전당</h2>
          <p>VERYUS 활동 랭킹을 한눈에 확인하세요</p>
          <div className="hall-header-actions">
            <span>최근 갱신: {updatedAt || '-'}</span>
            <button type="button" onClick={() => void loadRanking()}>새로고침</button>
          </div>
          <div className="hall-score-guide">
            <span>
              종합 점수: 게시글 {formatWeight(scoreWeights.post)}점 + 댓글 {formatWeight(scoreWeights.comment)}점 + 눈팅 {formatWeight(scoreWeights.lurking)}점/행동
              (합격곡 미반영)
            </span>
            <span>동점 시 닉네임 오름차순으로 정렬</span>
          </div>
        </div>

        <div className="hall-sections-grid">
          {sections.map((section) => {
            const limit = visibleCountBySection[section.key];
            const visibleRows = section.ranking.slice(0, limit);
            const remaining = Math.max(0, section.ranking.length - visibleRows.length);

            return (
              <section key={section.key} className="hall-section">
                <div className="hall-section-head">
                  <h3>{section.title}</h3>
                  <p>{section.subtitle}</p>
                </div>
                <div className="hall-table-wrap">
                  <table className="hall-table">
                    <thead>
                      <tr>
                        <th>순위</th>
                        <th>닉네임</th>
                        <th>활동량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="hall-empty">데이터가 아직 없습니다.</td>
                        </tr>
                      ) : (
                        visibleRows.map((entry, idx) => (
                          <tr key={`${section.key}-${entry.uid}-${idx}`}>
                            <td className="hall-rank">{MEDALS[idx] || `${idx + 1}`}</td>
                            <td>
                              <span className="hall-name-with-grade">
                                <span className="author-grade-label">{getGradeBadgeLabel(entry.grade)}</span>
                                <span className="hall-name">{entry.nickname}</span>
                              </span>
                              {entry.role && entry.role !== '일반' && entry.role !== '평가자' && (
                                <span className="hall-role">{entry.role}</span>
                              )}
                            </td>
                            <td>{Number.isInteger(entry.score) ? entry.score : entry.score.toFixed(1)}{section.unit}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {remaining > 0 && (
                  <div className="hall-load-more-wrap hall-load-more-inline">
                    <button
                      type="button"
                      className="hall-load-more-btn"
                      onClick={() =>
                        setVisibleCountBySection((prev) => ({
                          ...prev,
                          [section.key]: prev[section.key] + RANKING_LOAD_MORE_STEP
                        }))
                      }
                    >
                      {section.title} 더보기 ({remaining}명 남음)
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default HallOfFame;
