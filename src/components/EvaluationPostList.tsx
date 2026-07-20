import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  orderBy, 
  getDocs, 
  where,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  getDoc,
  updateDoc,
  doc as firestoreDoc
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import { getPostListGradeSpanProps } from '../utils/gradeDisplay';
import { getPublicRoleBadge, shouldShowPublicPosition } from '../utils/publicRoleBadge';
import { 
  Plus, 
  Heart, 
  MessageCircle,
  Search,
  Loader,
  User,
  Clock,
  Bookmark,
  Star,
  Eye
} from 'lucide-react';

interface EvaluationPost {
  id: string;
  title: string;
  description: string;
  writerNickname: string;
  writerUid: string;
  createdAt: any;
  likesCount: number;
  commentCount: number;
  views: number;
  likes: string[];
  writerGrade?: string;
  writerRole?: string;
  writerPosition?: string;
  category: string;
  status?: string;
  members?: string[];
  statusUpdatedAt?: any;
  lastCommentAt?: any;
}

interface User {
  uid: string;
  email: string;
  nickname?: string;
  role?: string;
  isLoggedIn: boolean;
}

type SortOrder = 'newest' | 'oldest';

const POSTS_PER_PAGE = 10;
const HIDDEN_COMPLETED_PER_PAGE = 10;
const EVALUATION_LIST_STATE_KEY = 'veryus_evaluation_list_state_v1';

const getCreatedAtMs = (value: any): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date ? d.getTime() : 0;
  }
  if (typeof value?.seconds === 'number') {
    const nanos = typeof value?.nanoseconds === 'number' ? value.nanoseconds : 0;
    return value.seconds * 1000 + Math.floor(nanos / 1_000_000);
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getEvaluationStatusBadgeClass = (post: Pick<EvaluationPost, 'category' | 'status'>): string => {
  if (post.category === 'feedback') return 'feedback';
  if (post.status === '합격' || post.status === '유지') return 'approved';
  if (post.status === '불합격' || post.status === '삭제') return 'rejected';
  return 'pending';
};

const getEvaluationStatusLabel = (
  post: Pick<EvaluationPost, 'category' | 'status'>,
  fallback = '대기'
): string => {
  if (post.category === 'feedback') return '피드백';
  return post.status || fallback;
};

const getEvaluationCategoryLabel = (category: string): string => {
  if (category === 'busking') return '버스킹심사곡';
  if (category === 'rejudge') return '재심사';
  if (category === 'feedback') return '피드백요청';
  return '평가';
};

const isJudgedCompletedStatus = (status?: string): boolean =>
  status === '합격' || status === '불합격' || status === '유지' || status === '삭제';

const isJudgedCategory = (category: string): boolean =>
  category === 'busking' || category === 'rejudge';

const getEvaluationPostCardClass = (post: Pick<EvaluationPost, 'category' | 'status'>): string =>
  `post-card post-card--eval-${getEvaluationStatusBadgeClass(post)}`;

const EvaluationPostList: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const persistedStateRef = useRef<{ searchTerm?: string; sortOrder?: SortOrder; scrollY?: number; lastViewedPostId?: string } | null>(null);
  const restoredScrollYRef = useRef<number | null>(null);
  const pendingRestoreScrollYRef = useRef<number | null>(null);
  const restoreAttemptCountRef = useRef(0);
  const anchorRestoredRef = useRef(false);
  const allowPersistRef = useRef(false);
  if (persistedStateRef.current === null) {
    try {
      const raw = sessionStorage.getItem(EVALUATION_LIST_STATE_KEY);
      persistedStateRef.current = raw ? JSON.parse(raw) : {};
    } catch {
      persistedStateRef.current = {};
    }
  }
  const shouldRestoreOnMountRef = useRef(
    Boolean((location.state as { preserveScroll?: boolean } | null)?.preserveScroll) ||
      Boolean(persistedStateRef.current?.lastViewedPostId)
  );
  const [posts, setPosts] = useState<EvaluationPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState(() => persistedStateRef.current?.searchTerm || '');
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => persistedStateRef.current?.sortOrder || 'newest');
  const [lastViewedPostId, setLastViewedPostId] = useState(() => persistedStateRef.current?.lastViewedPostId || '');
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hiddenCompletedPosts, setHiddenCompletedPosts] = useState<EvaluationPost[]>([]);
  const [hiddenCompletedVisibleCount, setHiddenCompletedVisibleCount] = useState(HIDDEN_COMPLETED_PER_PAGE);
  const observer = useRef<IntersectionObserver | null>(null);
  const lastPostElementRef = useRef<HTMLDivElement | null>(null);

  const fetchPosts = useCallback(async (isInitial: boolean = false) => {
    try {
      if (isLoadingMore) return;
      
      setIsLoadingMore(!isInitial);
      setError(null);
      
      // 검색어가 있거나 오래된순이면 전체를 가져와 필터링(페이지네이션 비활성화)
      const hasSearchTerm = searchTerm && searchTerm.trim().length > 0;
      const shouldLoadAll = hasSearchTerm || sortOrder === 'oldest';
      const sortDirection = sortOrder === 'oldest' ? 'asc' : 'desc';
      
      let baseQuery;
      
      if (shouldLoadAll) {
        // 검색어가 있을 때는 모든 게시글 가져오기 (페이지네이션 없음)
        baseQuery = query(
          collection(db, 'posts'),
          where('type', '==', 'evaluation'),
          orderBy('createdAt', sortDirection)
        );
      } else {
        // 검색어가 없을 때는 페이지네이션 사용
        if (!isInitial && lastVisible) {
          baseQuery = query(
            collection(db, 'posts'),
            where('type', '==', 'evaluation'),
            orderBy('createdAt', sortDirection),
            startAfter(lastVisible),
            limit(POSTS_PER_PAGE * 3) // 필터링으로 인해 일부가 제외될 수 있으므로 더 많이 가져오기
          );
        } else {
          baseQuery = query(
            collection(db, 'posts'),
            where('type', '==', 'evaluation'),
            orderBy('createdAt', sortDirection),
            limit(POSTS_PER_PAGE * 3) // 필터링으로 인해 일부가 제외될 수 있으므로 더 많이 가져오기
          );
        }
      }

      const snapshot = await getDocs(baseQuery);
      
      let rawPosts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: getCreatedAtMs(doc.data().createdAt)
      })) as EvaluationPost[];

      // lastCommentAt 누락된 피드백 게시글은 최신 댓글 기준으로 보정
      const needsLastCommentAt = rawPosts.filter(
        post => post.category === 'feedback' && post.commentCount > 0 && !post.lastCommentAt
      );
      if (needsLastCommentAt.length > 0) {
        await Promise.all(needsLastCommentAt.map(async (post) => {
          try {
            const commentQuery = query(
              collection(db, 'comments'),
              where('postId', '==', post.id),
              orderBy('createdAt', 'desc'),
              limit(1)
            );
            const commentSnapshot = await getDocs(commentQuery);
            if (!commentSnapshot.empty) {
              const latestComment = commentSnapshot.docs[0].data();
              const latestCreatedAtRaw = latestComment.createdAt;
              const latestCreatedAt = latestCreatedAtRaw?.toDate
                ? latestCreatedAtRaw.toDate()
                : (latestCreatedAtRaw instanceof Date
                  ? latestCreatedAtRaw
                  : (latestCreatedAtRaw ? new Date(latestCreatedAtRaw) : null));
              if (latestCreatedAt) {
                post.lastCommentAt = latestCreatedAtRaw ?? latestCreatedAt;
                await updateDoc(firestoreDoc(db, 'posts', post.id), {
                  lastCommentAt: latestCreatedAtRaw ?? latestCreatedAt
                });
              }
            }
          } catch (err) {
            console.warn('피드백 게시글 lastCommentAt 보정 실패:', post.id, err);
          }
        }));
      }

      // 오래된순에서는 숨김/분리 없이 전체 글을 보여준다.
      const shouldIncludeAllForOldest = sortOrder === 'oldest';
      // 판정 완료된 게시물은 별도 리스트로 보관(최신순 전용)
      const completedHiddenCandidates = shouldIncludeAllForOldest
        ? []
        : rawPosts.filter(post =>
            isJudgedCategory(post.category) && isJudgedCompletedStatus(post.status)
          );

      // 합격/불합격 완료된 게시물 및 댓글이 달린 피드백 요청 게시물 숨김 처리
      const now = new Date().getTime();
      const twoDaysInMs = 2 * 24 * 60 * 60 * 1000; // 2일을 밀리초로 변환
      
      let newPosts = shouldIncludeAllForOldest
        ? [...rawPosts]
        : rawPosts.filter(post => {
            // 피드백 요청 카테고리 처리
            if (post.category === 'feedback') {
              // 피드백 요청: 마지막 댓글 기준 2일 경과 시 숨김 (commentCount와 무관하게 lastCommentAt 우선)
              if (post.lastCommentAt) {
                const lastCommentTime = post.lastCommentAt?.toDate 
                  ? post.lastCommentAt.toDate().getTime() 
                  : (post.lastCommentAt instanceof Date 
                    ? post.lastCommentAt.getTime() 
                    : new Date(post.lastCommentAt).getTime());
                const daysSinceLastComment = now - lastCommentTime;
                if (daysSinceLastComment >= twoDaysInMs) {
                  return false; // 숨김 처리
                }
              }
              // 댓글이 없거나 2일이 지나지 않았으면 표시
              return true;
            }
            
            // 버스킹 심사곡 / 재심사 처리
            // 합격·불합격·유지·삭제 처리된 경우
            if (isJudgedCompletedStatus(post.status)) {
              // 기존 데이터: statusUpdatedAt이 없으면 즉시 숨김
              if (!post.statusUpdatedAt) {
                return false; // 기존 데이터는 즉시 숨김
              }
              // 새로 올라온 데이터: 평가 완료 후 2일 이상 지났으면 숨김
              const statusUpdateTime = post.statusUpdatedAt?.toDate 
                ? post.statusUpdatedAt.toDate().getTime() 
                : (post.statusUpdatedAt instanceof Date 
                  ? post.statusUpdatedAt.getTime() 
                  : new Date(post.statusUpdatedAt).getTime());
              const daysSinceStatusUpdate = now - statusUpdateTime;
              if (daysSinceStatusUpdate >= twoDaysInMs) {
                return false; // 숨김 처리
              }
              // 2일이 지나지 않았으면 표시
              return true;
            }
            
            // 대기 상태인 경우 표시
            return !post.status || post.status === '대기';
          });

      const completedHiddenPosts = shouldIncludeAllForOldest
        ? []
        : completedHiddenCandidates.filter(post => {
            if (!post.statusUpdatedAt) return true;
            const statusUpdateTime = post.statusUpdatedAt?.toDate
              ? post.statusUpdatedAt.toDate().getTime()
              : (post.statusUpdatedAt instanceof Date
                ? post.statusUpdatedAt.getTime()
                : new Date(post.statusUpdatedAt).getTime());
            return now - statusUpdateTime >= twoDaysInMs;
          });

      const sortByCreatedAt = (arr: EvaluationPost[]) => {
        return [...arr].sort((a, b) => {
          const aTime = getCreatedAtMs(a.createdAt);
          const bTime = getCreatedAtMs(b.createdAt);
          return sortOrder === 'oldest' ? aTime - bTime : bTime - aTime;
        });
      };

      // 페이지네이션을 위해 필터링된 결과가 POSTS_PER_PAGE보다 적으면 더 가져오기
      if (!hasSearchTerm && newPosts.length < POSTS_PER_PAGE && snapshot.docs.length === POSTS_PER_PAGE * 3) {
        // 더 가져올 수 있는 경우가 있으므로 hasMore를 true로 설정
        // lastVisible은 원본 snapshot의 마지막 문서로 설정
        if (snapshot.docs.length > 0) {
          const lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
          setLastVisible(lastVisibleDoc);
        }
      } else if (!hasSearchTerm) {
        // 필터링 후에도 충분한 게시물이 있거나, 더 이상 가져올 게 없을 때
        if (snapshot.docs.length > 0) {
          const lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
          setLastVisible(lastVisibleDoc);
        }
      }

      if (newPosts.length === 0 && isInitial) {
        setPosts([]);
        setHasMore(false);
        setLoading(false);
        setIsLoadingMore(false);
        return;
      }

      // 검색어로 필터링 (클라이언트 사이드)
      if (hasSearchTerm) {
        const searchLower = searchTerm.toLowerCase().trim();
        newPosts = newPosts.filter(post => {
          // 제목과 설명 검색
          const matchesTitleOrDescription = 
            (post.title && typeof post.title === 'string' && post.title.toLowerCase().includes(searchLower)) ||
            (post.description && typeof post.description === 'string' && post.description.toLowerCase().includes(searchLower));
          
          // 작성자 닉네임 검색
          const matchesWriter = 
            post.writerNickname && 
            typeof post.writerNickname === 'string' &&
            post.writerNickname.toLowerCase().includes(searchLower);
          
          // 참여 인원 닉네임 검색 - 정확한 매칭 및 부분 매칭 모두 지원
          let matchesMembers = false;
          if (post.members) {
            try {
              if (Array.isArray(post.members)) {
                matchesMembers = post.members.some((member: any) => {
                  if (member == null) return false;
                  // 문자열로 변환하고 공백 제거 후 검색
                  const memberStr = String(member).trim();
                  if (!memberStr) return false;
                  // 대소문자 구분 없이 부분 매칭
                  return memberStr.toLowerCase().includes(searchLower);
                });
              } else if (typeof post.members === 'string') {
                // 혹시 문자열로 저장된 경우 (콤마로 구분된 경우 등)
                const membersStr = String(post.members).toLowerCase();
                matchesMembers = membersStr.includes(searchLower);
              }
            } catch (error) {
              // members 필드 처리 중 오류 발생 시 무시
              console.warn('Members 검색 중 오류:', error, post);
            }
          }
          
          return matchesTitleOrDescription || matchesWriter || matchesMembers;
        });
        
        // 최신순 검색에서만 합격/불합격 완료된 게시물 및 댓글이 달린 피드백 요청 게시물 숨김 처리
        const searchNow = new Date().getTime();
        const searchTwoDaysInMs = 2 * 24 * 60 * 60 * 1000; // 2일을 밀리초로 변환
        if (!shouldIncludeAllForOldest) {
          newPosts = newPosts.filter(post => {
          // 피드백 요청 카테고리 처리
          if (post.category === 'feedback') {
            // 피드백 요청: 마지막 댓글 기준 2일 경과 시 숨김 (commentCount와 무관하게 lastCommentAt 우선)
            if (post.lastCommentAt) {
              const lastCommentTime = post.lastCommentAt?.toDate 
                ? post.lastCommentAt.toDate().getTime() 
                : (post.lastCommentAt instanceof Date 
                  ? post.lastCommentAt.getTime() 
                  : new Date(post.lastCommentAt).getTime());
              const daysSinceLastComment = searchNow - lastCommentTime;
              if (daysSinceLastComment >= searchTwoDaysInMs) {
                return false; // 숨김 처리
              }
            }
            // 댓글이 없거나 2일이 지나지 않았으면 표시
            return true;
          }
          
          // 버스킹 심사곡 / 재심사 처리
          // 합격·불합격·유지·삭제 처리된 경우
          if (isJudgedCompletedStatus(post.status)) {
            // 기존 데이터: statusUpdatedAt이 없으면 즉시 숨김
            if (!post.statusUpdatedAt) {
              return false; // 기존 데이터는 즉시 숨김
            }
            // 새로 올라온 데이터: 평가 완료 후 2일 이상 지났으면 숨김
            const statusUpdateTime = post.statusUpdatedAt?.toDate 
              ? post.statusUpdatedAt.toDate().getTime() 
              : (post.statusUpdatedAt instanceof Date 
                ? post.statusUpdatedAt.getTime() 
                : new Date(post.statusUpdatedAt).getTime());
            const daysSinceStatusUpdate = searchNow - statusUpdateTime;
            if (daysSinceStatusUpdate >= searchTwoDaysInMs) {
              return false; // 숨김 처리
            }
            // 2일이 지나지 않았으면 표시
            return true;
          }
          
          // 대기 상태인 경우 표시
          return !post.status || post.status === '대기';
          });
        }
      }

      // 작성자 등급/역할/포지션 최신화
      const userCache = new Map<string, {grade?: string, role?: string, position?: string}>();
      await Promise.all(newPosts.map(async (post) => {
        if (!userCache.has(post.writerUid)) {
          const userDoc = await getDoc(firestoreDoc(db, 'users', post.writerUid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            userCache.set(post.writerUid, {
              grade: userData.grade || '🍒',
              role: userData.role || '일반',
              position: userData.position || ''
            });
          } else {
            userCache.set(post.writerUid, {
              grade: '🍒',
              role: '일반',
              position: ''
            });
          }
        }
        const userInfo = userCache.get(post.writerUid);
        post.writerGrade = userInfo?.grade || '🍒';
        post.writerRole = userInfo?.role || '일반';
        post.writerPosition = userInfo?.position || '';
      }));

      // 검색어/오래된순은 전체 조회이므로 페이지네이션 없음
      if (shouldLoadAll) {
        setHasMore(false);
        setLastVisible(null);
        setPosts(sortByCreatedAt(newPosts));
        setHiddenCompletedPosts(sortByCreatedAt(completedHiddenPosts));
        setHiddenCompletedVisibleCount(HIDDEN_COMPLETED_PER_PAGE);
      } else {
        // 원본 snapshot의 길이를 기준으로 hasMore 결정
        // 필터링으로 인해 실제 표시되는 게시물 수가 적을 수 있음
        const hasMoreData = snapshot.docs.length === POSTS_PER_PAGE * 3;
        setHasMore(hasMoreData);
        
        if (isInitial) {
          setPosts(newPosts);
          setHiddenCompletedPosts(sortByCreatedAt(completedHiddenPosts));
          setHiddenCompletedVisibleCount(HIDDEN_COMPLETED_PER_PAGE);
        } else {
          setPosts(prev => [...prev, ...newPosts]);
          setHiddenCompletedPosts(prev => {
            const merged = [...prev, ...completedHiddenPosts];
            const uniqueById = new Map<string, EvaluationPost>();
            merged.forEach(post => uniqueById.set(post.id, post));
            return sortByCreatedAt(Array.from(uniqueById.values()));
          });
        }
      }

      setLoading(false);
      setIsLoadingMore(false);
    } catch (error) {
      console.error('평가 게시글 로딩 에러:', error);
      setError('게시글을 불러오는 중 오류가 발생했습니다.');
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, lastVisible, searchTerm, sortOrder]);

  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      try {
        setUser(JSON.parse(userString));
      } catch (error) {
        console.error('사용자 정보 파싱 에러:', error);
      }
    }
  }, []);

  useEffect(() => {
    try {
      if (!allowPersistRef.current) return;
      sessionStorage.setItem(
        EVALUATION_LIST_STATE_KEY,
        JSON.stringify({
          searchTerm,
          sortOrder,
          scrollY: window.scrollY,
          lastViewedPostId
        })
      );
    } catch {
      // ignore
    }
  }, [searchTerm, sortOrder, lastViewedPostId]);

  useEffect(() => {
    if (!shouldRestoreOnMountRef.current || loading || anchorRestoredRef.current || !lastViewedPostId) return;
    const target = document.querySelector(`[data-post-id="${lastViewedPostId}"]`) as HTMLElement | null;
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: 'center', behavior: 'auto' });
        anchorRestoredRef.current = true;
        restoredScrollYRef.current = window.scrollY;
        pendingRestoreScrollYRef.current = null;
        allowPersistRef.current = true;
      });
      return;
    }
    if (!hasMore) {
      anchorRestoredRef.current = true;
      allowPersistRef.current = true;
    }
  }, [loading, posts.length, hiddenCompletedPosts.length, hasMore, lastViewedPostId]);

  useEffect(() => {
    if (loading) return;

    if (pendingRestoreScrollYRef.current === null) {
      const savedY = persistedStateRef.current?.scrollY;
      if (typeof savedY !== 'number' || savedY <= 0) {
        allowPersistRef.current = true;
        return;
      }
      pendingRestoreScrollYRef.current = savedY;
    }

    if (restoredScrollYRef.current !== null) return;

    const targetY = pendingRestoreScrollYRef.current;
    if (typeof targetY !== 'number') {
      allowPersistRef.current = true;
      return;
    }

    requestAnimationFrame(() => {
      window.scrollTo({ top: targetY, behavior: 'auto' });

      const currentY = window.scrollY || window.pageYOffset || 0;
      const reachedTarget = currentY >= targetY - 24;
      const exhausted = !hasMore || restoreAttemptCountRef.current >= 12;

      if (reachedTarget || exhausted) {
        restoredScrollYRef.current = targetY;
        pendingRestoreScrollYRef.current = null;
        allowPersistRef.current = true;
        return;
      }

      restoreAttemptCountRef.current += 1;
    });
  }, [loading, posts.length, hasMore]);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(() => {
      setPosts([]);
      setHiddenCompletedPosts([]);
      setHiddenCompletedVisibleCount(HIDDEN_COMPLETED_PER_PAGE);
      setLastVisible(null);
      setHasMore(true);
      setLoading(true);
      setError(null);
      restoredScrollYRef.current = null;
      pendingRestoreScrollYRef.current = null;
      restoreAttemptCountRef.current = 0;
      anchorRestoredRef.current = false;
      allowPersistRef.current = false;
      fetchPosts(true);
    }, searchTerm ? 400 : 0);

    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchTerm, sortOrder]);

  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '20px',
      threshold: 1.0
    };

    const handleObserver = (entries: IntersectionObserverEntry[]) => {
      const [target] = entries;
      if (target.isIntersecting && hasMore && !isLoadingMore && !loading && !error) {
        fetchPosts(false);
      }
    };

    const currentObserver = new IntersectionObserver(handleObserver, options);
    observer.current = currentObserver;

    const lastElement = lastPostElementRef.current;
    if (lastElement) {
      currentObserver.observe(lastElement);
    }

    return () => {
      if (lastElement) {
        currentObserver.unobserve(lastElement);
      }
      currentObserver.disconnect();
    };
  }, [hasMore, isLoadingMore, loading, error, fetchPosts]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPosts([]);
    setLastVisible(null);
    setHasMore(true);
    fetchPosts(true);
  };

  const handlePostClick = (postId: string) => {
    try {
      setLastViewedPostId(postId);
      sessionStorage.setItem(
        EVALUATION_LIST_STATE_KEY,
        JSON.stringify({
          searchTerm,
          sortOrder,
          scrollY: window.scrollY,
          lastViewedPostId: postId
        })
      );
    } catch {
      // ignore
    }
    navigate(`/evaluation/${postId}`);
  };

  const handleWritePost = () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    navigate('/evaluation/write');
  };

  const handleLoadMoreHiddenCompleted = async () => {
    const nextVisibleCount = hiddenCompletedVisibleCount + HIDDEN_COMPLETED_PER_PAGE;
    // 숨김 완료글 풀이 부족하고, 아직 가져올 원본 페이지가 남아있으면 먼저 추가 로드
    if (
      nextVisibleCount > hiddenCompletedPosts.length &&
      hasMore &&
      !searchTerm &&
      !isLoadingMore
    ) {
      await fetchPosts(false);
    }
    setHiddenCompletedVisibleCount(prev => prev + HIDDEN_COMPLETED_PER_PAGE);
  };

  const formatDate = (date: any) => {
    const targetMs = getCreatedAtMs(date);
    if (!targetMs) return '-';
    const now = new Date();
    const diffTime = now.getTime() - targetMs;
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffMinutes < 1) {
      return '방금 전';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}분 전`;
    } else if (diffHours < 24) {
      return `${diffHours}시간 전`;
    } else if (diffDays < 30) {
      return `${diffDays}일 전`;
    } else if (diffMonths < 12) {
      return `${diffMonths}달 전`;
    } else {
      return `${diffYears}년 전`;
    }
  };

  const formatExactDateTime = (date: any) => {
    const targetMs = getCreatedAtMs(date);
    if (!targetMs) return '-';
    const target = new Date(targetMs);
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    const hh = String(target.getHours()).padStart(2, '0');
    const mi = String(target.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  };

  return (
    <div className="board-container">
      <div className="board-header">
        {/* '메인으로' 버튼 완전히 삭제 */}
      </div>
      <div className="board-controls">
        <div className="search-container">
          <h1 className="board-title">
            <Star size={28} />
            평가게시판
          </h1>
          <form onSubmit={handleSearch} className="search-form">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="검색어를 입력하세요"
              className="search-input"
            />
            <button type="submit" className="search-button">
              <Search size={20} />
            </button>
          </form>
        </div>
        <div className="action-buttons">
          <div className="post-sort-wrap" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <label htmlFor="evaluation-sort-order" className="post-sort-label">
              정렬
            </label>
            <select
              id="evaluation-sort-order"
              className="post-sort-select"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            >
              <option value="newest">최신순</option>
              <option value="oldest">오래된순</option>
            </select>
          </div>
          <button 
            className="write-button" 
            onClick={handleWritePost}
            disabled={!user}
            title={!user ? "로그인이 필요합니다" : "새 글 작성"}
          >
            <Plus size={16} />
            글쓰기
          </button>
        </div>
      </div>
      <div className="board-info-banner">
        신입은 오프1회 참여 후 평가게시판 업로드가 가능합니다
      </div>
      <div className="post-list">
        {loading ? (
          <div className="loading-container">
            <Loader size={24} className="loading-spinner" />
            <span>게시글을 불러오는 중...</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="empty-posts">
            <Star size={48} />
            <p>게시글이 없습니다.</p>
            {searchTerm && (
              <button onClick={() => {
                setSearchTerm('');
                fetchPosts(true);
              }} className="reset-search">
                검색 초기화
              </button>
            )}
          </div>
        ) : (
          posts.map((post, index) => (
            <article
              key={post.id}
              className={getEvaluationPostCardClass(post)}
              data-post-id={post.id}
              onClick={() => handlePostClick(post.id)}
              ref={index === posts.length - 1 ? lastPostElementRef : null}
            >
              <div className="post-category-title">
                <span className="post-category category-badge">
                  {getEvaluationCategoryLabel(post.category)}
                </span>
                <h2 className="post-title" style={{ fontSize: '1.3rem' }}>{post.title}</h2>
              </div>
              <div className="post-meta">
                <div className="post-author">
                  <span {...getPostListGradeSpanProps(post.writerGrade)} />
                  <span className="author-name post-author-name--list">
                    {post.writerNickname}
                  </span>
                  <span className={`role-badge ${getPublicRoleBadge(post.writerRole, post.writerPosition)}`}>
                    {getPublicRoleBadge(post.writerRole, post.writerPosition)}
                  </span>
                  {shouldShowPublicPosition(post.writerPosition) && (
                    <span className="author-position">{post.writerPosition}</span>
                  )}
                </div>
              </div>
              <div className="post-content-preview">
                {post.description}
              </div>
              <div className="post-stats post-stats-row">
                <span className="post-stat post-stat-item">
                  <Heart size={16} />
                  {post.likesCount || 0}
                </span>
                <span className="post-stat post-stat-item">
                  <MessageCircle size={16} />
                  {post.commentCount || 0}
                </span>
                <span className="post-date post-stat-item">
                  <Clock size={16} />
                  {formatDate(post.createdAt)}
                  <span style={{ opacity: 0.85, fontSize: '0.78rem' }}>
                    ({formatExactDateTime(post.createdAt)})
                  </span>
                </span>
                <span className="post-views post-stat-item">
                  <Eye size={16} />
                  조회 {post.views || 0}
                </span>
                <span className={`post-status-badge ${getEvaluationStatusBadgeClass(post)}`}>
                  {getEvaluationStatusLabel(post)}
                </span>
              </div>
            </article>
          ))
        )}
      </div>
      {!loading && hiddenCompletedPosts.length > 0 && (
        <div className="post-list" style={{ marginTop: '1.25rem' }}>
          <div className="board-info-banner" style={{ marginBottom: '0.75rem' }}>
            평가 완료되어 목록에서 숨겨진 글
          </div>
          {hiddenCompletedPosts.slice(0, hiddenCompletedVisibleCount).map((post) => (
            <article
              key={`hidden-${post.id}`}
              className={getEvaluationPostCardClass(post)}
              data-post-id={post.id}
              onClick={() => handlePostClick(post.id)}
              style={{ opacity: 0.88 }}
            >
              <div className="post-category-title">
                <span className="post-category category-badge">
                  {getEvaluationCategoryLabel(post.category)}
                </span>
                <h2 className="post-title" style={{ fontSize: '1.3rem' }}>{post.title}</h2>
              </div>
              <div className="post-meta">
                <div className="post-author">
                  <span {...getPostListGradeSpanProps(post.writerGrade)} />
                  <span className="author-name post-author-name--list">
                    {post.writerNickname}
                  </span>
                  <span className={`role-badge ${getPublicRoleBadge(post.writerRole, post.writerPosition)}`}>
                    {getPublicRoleBadge(post.writerRole, post.writerPosition)}
                  </span>
                  {shouldShowPublicPosition(post.writerPosition) && (
                    <span className="author-position">{post.writerPosition}</span>
                  )}
                </div>
              </div>
              <div className="post-content-preview">
                {post.description}
              </div>
              <div className="post-stats post-stats-row">
                <span className="post-stat post-stat-item">
                  <Heart size={16} />
                  {post.likesCount || 0}
                </span>
                <span className="post-stat post-stat-item">
                  <MessageCircle size={16} />
                  {post.commentCount || 0}
                </span>
                <span className="post-date post-stat-item">
                  <Clock size={16} />
                  {formatDate(post.createdAt)}
                  <span style={{ opacity: 0.85, fontSize: '0.78rem' }}>
                    ({formatExactDateTime(post.createdAt)})
                  </span>
                </span>
                <span className="post-views post-stat-item">
                  <Eye size={16} />
                  조회 {post.views || 0}
                </span>
                <span className={`post-status-badge ${getEvaluationStatusBadgeClass(post)}`}>
                  {getEvaluationStatusLabel(post, '평가완료')}
                </span>
              </div>
            </article>
          ))}
          {hiddenCompletedVisibleCount < hiddenCompletedPosts.length && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.75rem' }}>
              <button
                className="write-button"
                onClick={handleLoadMoreHiddenCompleted}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? '불러오는 중...' : '더보기'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EvaluationPostList; 