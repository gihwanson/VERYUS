import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  doc, 
  getDoc, 
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase';
import { formatAttachmentSize } from '../utils/boardAttachmentLimits';
import { resolveBoardAttachmentSizeBytes } from '../utils/resolveBoardAttachmentSize';
import { 
  ArrowLeft,
  Heart,
  MessageCircle,
  MoreVertical,
  Edit,
  Trash,
  Send,
  Eye,
  User,
  Clock,
  AlertTriangle,
  Loader,
  MessageSquare,
  Pause,
  Play
} from 'lucide-react';
import CommentSection from './CommentSection';
import { useAudioPlayer } from '../App';
import { stopBoardAudio } from '../utils/boardAudioPlayer';
import { NotificationService } from '../utils/notificationService';
import {
  approvedSongCountsByNicknameFromDocs,
  notifyStaffOnApprovedSongCountMilestones
} from '../utils/approvedSongMilestone';
import { getPublicRoleBadge, shouldShowPublicPosition } from '../utils/publicRoleBadge';
import GradeFxEmoji from './GradeFxEmoji';
import {
  SkinnedNickname,
  SkinnedPostTitle,
  SkinnedRoleBadge,
  SkinnedPosition,
  usePostBodySkinClass,
} from './SkinnedAuthor';
import { isEvaluationJudge } from '../utils/evaluationJudge';
import {
  MEMBER_FIRST_PASS_STATUS,
  countMemberVotes,
  ensureMemberRoundEndsAt,
  formatMemberRoundDday,
  isBuskingMemberRoundOpen,
  listMemberVotes,
  tryResolveExpiredMemberRound,
  type MemberVoteChoice,
  type MemberVotesMap,
} from '../utils/evaluationMemberRound';

interface User {
  uid: string;
  email: string;
  nickname: string;
  role?: string;
  grade?: string;
  position?: string;
  isLoggedIn: boolean;
}

interface EvaluationPost {
  id: string;
  title: string;
  description: string;
  writerUid: string;
  writerNickname: string;
  createdAt: any;
  likesCount: number;
  commentCount: number;
  views: number;
  likes: string[];
  writerGrade?: string;
  writerPosition?: string;
  writerRole?: string;
  status?: string;
  category?: string;
  audioUrl?: string;
  fileName?: string;
  fileSizeBytes?: number;
  duration?: number;
  members?: string[];
  memberVotes?: MemberVotesMap;
  memberRoundEndsAt?: any;
}

// 타입 선언 추가
declare global {
  interface Window {
    audioPlayerRef?: HTMLAudioElement | null;
  }
}

const EvaluationPostDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [post, setPost] = useState<EvaluationPost | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageContent, setMessageContent] = useState('');
  const [resolvedFileSizeBytes, setResolvedFileSizeBytes] = useState<number | null>(null);
  const [fileSizeLoading, setFileSizeLoading] = useState(false);
  const [voting, setVoting] = useState(false);
  const memberRoundResolvingRef = useRef(false);
  const { isPlaying: isGlobalPlaying, pause: pauseGlobal, play: playGlobal, currentIdx: globalIdx } = useAudioPlayer();
  const location = useLocation();
  // 글로벌 플레이리스트 상태 기억용
  const globalStateRef = React.useRef<{idx: number, wasPlaying: boolean}>({idx: 0, wasPlaying: false});
  const postBodySkinClass = usePostBodySkinClass({ writerUid: post?.writerUid, writerNickname: post?.writerNickname });

  // 닉네임으로 UID 찾기 함수
  const findUidByNickname = async (nickname: string): Promise<string | null> => {
    try {
      const q = query(
        collection(db, 'users'),
        where('nickname', '==', nickname.trim())
      );
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        return userDoc.id; // 문서 ID가 UID
      }
      return null;
    } catch (error) {
      console.error('닉네임으로 UID 찾기 에러:', error);
      return null;
    }
  };

  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (!userString) return;
    let parsedUser: User | null = null;
    try {
      parsedUser = JSON.parse(userString) as User;
      setUser(parsedUser);
    } catch (parseError) {
      console.error('사용자 정보 파싱 오류:', parseError);
      return;
    }

    const refreshUserProfile = async () => {
      if (!parsedUser?.uid) return;
      try {
        const userSnap = await getDoc(doc(db, 'users', parsedUser.uid));
        if (!userSnap.exists()) return;
        const userData = userSnap.data();
        const mergedUser: User = {
          ...parsedUser,
          email: (userData.email as string | undefined) || parsedUser.email,
          nickname: (userData.nickname as string | undefined) || parsedUser.nickname,
          role: (userData.role as string | undefined) || parsedUser.role,
          grade: (userData.grade as string | undefined) || parsedUser.grade,
          position: (userData.position as string | undefined) || parsedUser.position
        };
        setUser(mergedUser);
        localStorage.setItem('veryus_user', JSON.stringify({ ...mergedUser, isLoggedIn: true }));
      } catch (refreshError) {
        console.error('최신 사용자 정보 로딩 실패:', refreshError);
      }
    };

    void refreshUserProfile();
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    // 조회수 증가 - 항상 1씩 증가
    const incrementViews = async () => {
      try {
        await updateDoc(doc(db, 'posts', id), {
          views: increment(1)
        });
      } catch (error) {
        console.error('조회수 업데이트 에러:', error);
      }
    };
    incrementViews();
    const unsubscribe = onSnapshot(doc(db, 'posts', id), (docSnapshot) => {
      if (!docSnapshot.exists()) {
        setError('게시글을 찾을 수 없습니다.');
        setLoading(false);
        return;
      }
      const data = docSnapshot.data();
      const { writerGrade, writerRole, writerPosition, ...rest } = data;
      setPost(prev => {
        const p = (prev || {}) as EvaluationPost;
        return {
          ...p,
          ...rest,
          id: docSnapshot.id,
          likes: Array.isArray(data.likes) ? data.likes : [],
          writerGrade: p.writerGrade ?? writerGrade,
          writerRole: p.writerRole ?? writerRole,
          writerPosition: p.writerPosition ?? writerPosition,
        } as EvaluationPost;
      });
      setLoading(false);
    }, (error) => {
      setError('게시글을 불러오는 중 오류가 발생했습니다.');
      setLoading(false);
    });
    return () => unsubscribe();
  }, [id]);

  // 기존 대기곡: 1차 마감이 없으면 지금부터 3일(D-3) 부여 → 이후 만료 시 과반수 확정
  useEffect(() => {
    if (!post?.id || post.category !== 'busking') return;
    if (post.status && post.status !== '대기') return;

    let cancelled = false;
    void (async () => {
      try {
        if (!post.memberRoundEndsAt) {
          const endsAt = await ensureMemberRoundEndsAt(post);
          if (cancelled || !endsAt) return;
          setPost((p) => (p ? { ...p, memberRoundEndsAt: endsAt } : p));
          return;
        }
        if (memberRoundResolvingRef.current) return;
        if (isBuskingMemberRoundOpen(post)) return;
        memberRoundResolvingRef.current = true;
        await tryResolveExpiredMemberRound(post);
      } catch (err) {
        console.error('1차 심사 처리 실패:', err);
      } finally {
        memberRoundResolvingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [post?.id, post?.status, post?.category, post?.memberRoundEndsAt, post?.memberVotes]);

  const handleMemberVote = async (choice: MemberVoteChoice) => {
    if (!user || !post) {
      alert('로그인이 필요합니다.');
      return;
    }
    if (user.uid === post.writerUid) {
      alert('본인이 올린 심사곡은 합/불 평가할 수 없습니다.');
      return;
    }
    if (!isBuskingMemberRoundOpen(post)) {
      alert('멤버 1차 심사 기간이 아닙니다.');
      return;
    }
    try {
      setVoting(true);
      await updateDoc(doc(db, 'posts', post.id), {
        [`memberVotes.${user.uid}`]: {
          choice,
          nickname: user.nickname || '익명',
          votedAt: Date.now(),
        },
      });
    } catch (error) {
      console.error('멤버 평가 저장 실패:', error);
      alert('평가 저장 중 오류가 발생했습니다.');
    } finally {
      setVoting(false);
    }
  };

  // 작성자 프로필(등급) — 댓글과 동일하게 users 문서를 기준으로 표시
  useEffect(() => {
    if (!post?.writerUid) return;
    const userRef = doc(db, 'users', post.writerUid);
    const unsubscribe = onSnapshot(userRef, (userDoc) => {
      if (!userDoc.exists()) return;
      const userData = userDoc.data();
      setPost((prevPost) => {
        if (!prevPost) return null;
        return {
          ...prevPost,
          writerGrade: userData.grade || prevPost.writerGrade || '🍒',
          writerRole: userData.role || prevPost.writerRole || '일반',
          writerPosition: userData.position || prevPost.writerPosition || '',
        };
      });
    });
    return () => unsubscribe();
  }, [post?.writerUid]);

  // 예전 글(fileSizeBytes 미저장)은 Firebase Storage 메타데이터로 용량 조회
  useEffect(() => {
    setResolvedFileSizeBytes(null);
    if (!post?.audioUrl || post.fileSizeBytes) {
      setFileSizeLoading(false);
      return;
    }
    let cancelled = false;
    setFileSizeLoading(true);
    void resolveBoardAttachmentSizeBytes(post.audioUrl)
      .then((bytes) => {
        if (!cancelled && bytes != null) setResolvedFileSizeBytes(bytes);
      })
      .finally(() => {
        if (!cancelled) setFileSizeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [post?.audioUrl, post?.fileSizeBytes]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);



  const handleLike = async () => {
    if (!user || !post) return;
    const likesArr = Array.isArray(post.likes) ? post.likes : [];
    try {
      const postRef = doc(db, 'posts', post.id);
      const isLiked = likesArr.includes(user.uid);
      await updateDoc(postRef, {
        likes: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
        likesCount: isLiked ? (post.likesCount || 0) - 1 : (post.likesCount || 0) + 1
      });
    } catch (error) {
      alert('좋아요 처리 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async () => {
    if (!post || !user || (user.uid !== post.writerUid && user.role !== '리더' && user.nickname !== '너래')) {
      alert('삭제 권한이 없습니다.');
      return;
    }

    if (!window.confirm('정말 이 게시글을 삭제하시겠습니까?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'posts', post.id));
      alert('게시글이 삭제되었습니다.');
      navigate('/evaluation');
    } catch (error) {
      console.error('게시글 삭제 오류:', error);
      alert('게시글 삭제 중 오류가 발생했습니다.');
    }
  };

  const canEditPost =
    user &&
    post &&
    (user.uid === post.writerUid || isEvaluationJudge(user));

  const handleEdit = () => {
    if (!canEditPost || !post) {
      alert('수정 권한이 없습니다.');
      return;
    }
    navigate(`/evaluation/edit/${post.id}`);
  };

  if (error) {
    return (
      <div className="error-container">
        <p>{error}</p>
        <button onClick={() => navigate('/evaluation', { state: { preserveScroll: true } })}>목록으로 돌아가기</button>
      </div>
    );
  }

  if (loading || !post) {
    return (
      <div className="loading-container">
        <span>게시글을 불러오는 중...</span>
      </div>
    );
  }

      return (
      <div className="post-detail-container">
        <div className="post-navigation glassmorphism">
          <button
            className="back-button glassmorphism"
            onClick={() => {
              stopBoardAudio();
              if (window.audioPlayerRef && !window.audioPlayerRef.paused) {
                window.audioPlayerRef.pause();
              }
              navigate('/evaluation', { state: { preserveScroll: true } });
            }}
          >
            <ArrowLeft size={20} />
            목록으로
          </button>
        </div>
        <article className={`post-detail ${postBodySkinClass}`.trim()}>
          <div className="post-detail-header">
            <div className="title-container">
              <div className="title-section">
                <SkinnedPostTitle
                  title={post.title}
                  writerNickname={post.writerNickname} writerUid={post.writerUid}
                  className="post-detail-title"
                  as="h1"
                />
              </div>
            </div>
            <div className="post-detail-meta">
              <div className="post-detail-author">
                <div className="author-section">
                  <span className="author-info" onClick={() => navigate(`/mypage/${post.writerUid}`)}>
                    <GradeFxEmoji grade={post.writerGrade} writerUid={post.writerUid} writerNickname={post.writerNickname} />
                    <SkinnedNickname nickname={post.writerNickname} writerUid={post.writerUid} writerNickname={post.writerNickname} />
                  </span>
                  <SkinnedRoleBadge
                    label={getPublicRoleBadge(post.writerRole, post.writerPosition)}
                    roleClassName={getPublicRoleBadge(post.writerRole, post.writerPosition)}
                    writerNickname={post.writerNickname} writerUid={post.writerUid}
                  />
                  {shouldShowPublicPosition(post.writerPosition) && (
                    <SkinnedPosition position={post.writerPosition} writerUid={post.writerUid} writerNickname={post.writerNickname} />
                  )}
                </div>
                <div className="post-detail-info">
                  <span className="post-detail-date">
                    <Clock size={16} />
                    {post.createdAt && (post.createdAt instanceof Date ? 
                      (() => {
                        const now = new Date();
                        const diffTime = now.getTime() - post.createdAt.getTime();
                        const diffMinutes = Math.floor(diffTime / (1000 * 60));
                        const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                        const diffMonths = Math.floor(diffDays / 30);
                        const diffYears = Math.floor(diffDays / 365);
                        
                        if (diffMinutes < 1) return '방금 전';
                        else if (diffMinutes < 60) return `${diffMinutes}분 전`;
                        else if (diffHours < 24) return `${diffHours}시간 전`;
                        else if (diffDays < 30) return `${diffDays}일 전`;
                        else if (diffMonths < 12) return `${diffMonths}달 전`;
                        else return `${diffYears}년 전`;
                      })() : 
                      (() => {
                        const date = new Date(post.createdAt.seconds * 1000);
                        const now = new Date();
                        const diffTime = now.getTime() - date.getTime();
                        const diffMinutes = Math.floor(diffTime / (1000 * 60));
                        const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                        const diffMonths = Math.floor(diffDays / 30);
                        const diffYears = Math.floor(diffDays / 365);
                        
                        if (diffMinutes < 1) return '방금 전';
                        else if (diffMinutes < 60) return `${diffMinutes}분 전`;
                        else if (diffHours < 24) return `${diffHours}시간 전`;
                        else if (diffDays < 30) return `${diffDays}일 전`;
                        else if (diffMonths < 12) return `${diffMonths}달 전`;
                        else return `${diffYears}년 전`;
                      })()
                    )}
                  </span>
                  <span className="post-detail-views">
                    <Eye size={16} />
                    조회 {post.views || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="post-detail-content">
            {/* 상태별 안내문구 */}
            {post.status === '불합격' && (
              <div style={{marginBottom: 12, color: '#F43F5E', fontWeight: 700, fontSize: '1.08rem', background:'#FFF1F2', borderRadius:12, padding:'10px 18px', textAlign:'center'}}>
                해당 곡은 불합격처리 되었습니다
              </div>
            )}
            {post.status === '합격' && (
              <div style={{marginBottom: 12, color: 'var(--primary-color, #8b5a2b)', fontWeight: 700, fontSize: '1.08rem', background:'var(--paper-tag-bg, #f0e6d6)', borderRadius:12, padding:'10px 18px', textAlign:'center'}}>
                해당 곡은 합격처리 되었습니다
              </div>
            )}
            {post.status === '삭제' && (
              <div style={{marginBottom: 12, color: '#F43F5E', fontWeight: 700, fontSize: '1.08rem', background:'#FFF1F2', borderRadius:12, padding:'10px 18px', textAlign:'center'}}>
                재심사 결과 해당 곡은 삭제로 판정되었습니다
              </div>
            )}
            {post.status === '유지' && (
              <div style={{marginBottom: 12, color: 'var(--primary-color, #8b5a2b)', fontWeight: 700, fontSize: '1.08rem', background:'var(--paper-tag-bg, #f0e6d6)', borderRadius:12, padding:'10px 18px', textAlign:'center'}}>
                재심사 결과 해당 곡은 유지로 판정되었습니다
              </div>
            )}
            {post.status === MEMBER_FIRST_PASS_STATUS && (
              <div style={{marginBottom: 12, color: '#1D4ED8', fontWeight: 700, fontSize: '1.08rem', background:'#EFF6FF', borderRadius:12, padding:'10px 18px', textAlign:'center'}}>
                1차 합격 / 너래 평가대기
              </div>
            )}
            {(!post.status || post.status === '대기') && (
              post.category === 'feedback' ? (
                <div style={{marginBottom: 12, color: 'var(--primary-color, #8b5a2b)', fontWeight: 700, fontSize: '1.08rem', background:'var(--paper-tag-bg, #f0e6d6)', borderRadius:12, padding:'10px 18px', textAlign:'center'}}>
                  피드백을 남겨주세요!
                </div>
              ) : post.category === 'rejudge' ? (
                <div style={{marginBottom: 12, color: '#888', fontWeight: 600, fontSize: '1.05rem', background:'#F3F4F6', borderRadius:12, padding:'10px 18px', textAlign:'center'}}>
                  재심사 대기중 입니다
                </div>
              ) : (
                <div style={{marginBottom: 12, color: '#888', fontWeight: 600, fontSize: '1.05rem', background:'#F3F4F6', borderRadius:12, padding:'10px 18px', textAlign:'center'}}>
                  {isBuskingMemberRoundOpen(post)
                    ? `멤버 1차 심사 중${formatMemberRoundDday(post) ? ` · ${formatMemberRoundDday(post)}` : ''}`
                    : '1차 심사 종료 · 너래 평가대기'}
                </div>
              )
            )}
            {/* 함께한 멤버 노출 */}
            {Array.isArray(post.members) && post.members.length > 0 && (
              <div style={{marginBottom: 10, color: 'var(--primary-color, #8b5a2b)', fontWeight: 600, fontSize: '1.04rem', background:'var(--paper-tag-bg, #f0e6d6)', borderRadius:12, padding:'8px 16px', textAlign:'center'}}>
                함께한 멤버: {post.members.join(', ')}
              </div>
            )}
            <div>
              {post.description && post.description.split('\n').map((line, idx) => (
                <p key={idx} style={{margin:0, padding:0}}>{line}</p>
              ))}
            </div>
          </div>

          {/* 오디오 플레이어 (녹음게시판과 동일) */}
          {post.audioUrl && (
            <div style={{marginBottom:18}}>
              {(post.fileName || post.fileSizeBytes != null || resolvedFileSizeBytes != null || fileSizeLoading) && (
                <div style={{
                  background: 'var(--paper-tag-bg, #f0e6d6)', color: 'var(--primary-color, #8b5a2b)', borderRadius: '12px', padding: '10px 20px', margin: '0 auto 18px auto', maxWidth: 340, minWidth: 180, textAlign: 'center', fontWeight: 600, fontSize: '1rem', lineHeight: 1.5
                }}>
                  {post.fileName && <div>파일명: {post.fileName}</div>}
                  {(post.fileSizeBytes ?? resolvedFileSizeBytes) != null ? (
                    <div style={{ fontSize: '0.92rem', marginTop: post.fileName ? 4 : 0 }}>
                      용량: {formatAttachmentSize(post.fileSizeBytes ?? resolvedFileSizeBytes!)}
                    </div>
                  ) : fileSizeLoading ? (
                    <div style={{ fontSize: '0.88rem', fontWeight: 500, opacity: 0.75, marginTop: post.fileName ? 4 : 0 }}>
                      용량 확인 중…
                    </div>
                  ) : null}
                </div>
              )}
              <AudioPlayer audioUrl={post.audioUrl} duration={post.duration} />
              <a
                href={post.audioUrl}
                download={post.fileName || 'evaluation.mp3'}
                className="stat-button"
                style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--primary-color, #8b5a2b)', textDecoration: 'none', fontWeight: 600 }}
                title="다운로드"
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span style={{ fontSize: 15 }}>다운로드</span>
              </a>

              {/* 멤버 1차 합/불 평가 (버스킹심사곡) */}
              {post.category === 'busking' && (
                <div
                  style={{
                    margin: '18px 0 0 0',
                    padding: '14px 16px',
                    borderRadius: 14,
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#334155', textAlign: 'center', marginBottom: 8 }}>
                    멤버 합/불 평가
                    {formatMemberRoundDday(post) && (
                      <span style={{ marginLeft: 8, color: '#D97706', fontSize: '0.92rem' }}>
                        {formatMemberRoundDday(post)}
                      </span>
                    )}
                  </div>
                  {(() => {
                    const isJudge = isEvaluationJudge(user);
                    const { pass, fail, total } = countMemberVotes(post.memberVotes);
                    const voters = listMemberVotes(post.memberVotes);
                    const myVote = user ? post.memberVotes?.[user.uid]?.choice : undefined;
                    return (
                      <>
                        {isJudge ? (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ textAlign: 'center', fontSize: '0.92rem', color: '#64748B', marginBottom: 8 }}>
                              합 {pass} · 불 {fail}
                              {total > 0 ? ` (총 ${total}표)` : ' (아직 평가 없음)'}
                            </div>
                            {voters.length > 0 && (
                              <div
                                style={{
                                  maxHeight: 160,
                                  overflowY: 'auto',
                                  background: '#fff',
                                  borderRadius: 10,
                                  border: '1px solid #E2E8F0',
                                  padding: '8px 10px',
                                  fontSize: '0.84rem',
                                }}
                              >
                                <div style={{ fontWeight: 700, color: '#475569', marginBottom: 6, textAlign: 'center' }}>
                                  투표 내역 (너래·평가자 전용)
                                </div>
                                {voters.map((v) => (
                                  <div
                                    key={v.uid}
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      gap: 8,
                                      padding: '4px 2px',
                                      borderBottom: '1px solid #F1F5F9',
                                    }}
                                  >
                                    <span style={{ color: '#334155', fontWeight: 600 }}>{v.nickname}</span>
                                    <span style={{ color: v.choice === 'pass' ? '#059669' : '#E11D48', fontWeight: 700 }}>
                                      {v.choice === 'pass' ? '합격' : '불합격'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center', fontSize: '0.88rem', color: '#94A3B8', marginBottom: 10 }}>
                            합/불 집계는 비공개입니다
                            {myVote ? ` · 내 평가: ${myVote === 'pass' ? '합격' : '불합격'}` : ''}
                          </div>
                        )}
                        {isBuskingMemberRoundOpen(post) ? (
                          !user ? (
                            <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: '0.9rem' }}>
                              로그인 후 평가할 수 있습니다
                            </div>
                          ) : user.uid === post.writerUid ? (
                            <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: '0.9rem' }}>
                              본인이 올린 심사곡은 합/불 평가할 수 없습니다
                            </div>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                disabled={voting}
                                onClick={() => void handleMemberVote('pass')}
                                style={{
                                  background: myVote === 'pass' ? '#059669' : '#10B981',
                                  color: '#fff',
                                  fontWeight: 700,
                                  padding: '8px 20px',
                                  borderRadius: 8,
                                  border: myVote === 'pass' ? '2px solid #064E3B' : 'none',
                                  fontSize: 15,
                                  cursor: voting ? 'wait' : 'pointer',
                                  opacity: voting ? 0.7 : 1,
                                }}
                              >
                                {myVote === 'pass' ? '합격 ✓' : '합격'}
                              </button>
                              <button
                                type="button"
                                disabled={voting}
                                onClick={() => void handleMemberVote('fail')}
                                style={{
                                  background: myVote === 'fail' ? '#E11D48' : '#F43F5E',
                                  color: '#fff',
                                  fontWeight: 700,
                                  padding: '8px 20px',
                                  borderRadius: 8,
                                  border: myVote === 'fail' ? '2px solid #881337' : 'none',
                                  fontSize: 15,
                                  cursor: voting ? 'wait' : 'pointer',
                                  opacity: voting ? 0.7 : 1,
                                }}
                              >
                                {myVote === 'fail' ? '불합격 ✓' : '불합격'}
                              </button>
                            </div>
                          )
                        ) : (
                          <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: '0.88rem' }}>
                            {post.status === MEMBER_FIRST_PASS_STATUS
                              ? '1차 심사 종료 · 합격 과반 → 너래 평가대기'
                              : post.status === '불합격'
                                ? '1차 심사 결과 불합격이 반영되었습니다'
                                : post.status === '합격'
                                  ? '최종 합격 처리된 곡입니다'
                                  : '멤버 1차 심사가 종료되었습니다'}
                          </div>
                        )}
                        <div style={{ marginTop: 8, textAlign: 'center', fontSize: '0.78rem', color: '#94A3B8' }}>
                          1차 심사는 3일간 진행됩니다. 마감 시 합격이 더 많으면 1차 합격, 불합격이 더 많거나 동률이면 불합격 처리됩니다.
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* 합불 판정 버튼 — 멤버 1차 종료 후(1차합격·대기 마감) 또는 최종 합불 전환 */}
              {isEvaluationJudge(user) &&
                post.category === 'busking' &&
                (post.status === '합격' ||
                  post.status === '불합격' ||
                  post.status === MEMBER_FIRST_PASS_STATUS ||
                  (((!post.status || post.status === '대기') && !isBuskingMemberRoundOpen(post)))) && (
                <div style={{margin:'18px 0 0 0', display:'flex', justifyContent:'center', gap:16, flexDirection:'column', alignItems:'center'}}>
                  {(post.status === MEMBER_FIRST_PASS_STATUS || !post.status || post.status === '대기') && (
                    <div style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: 4 }}>
                      {post.status === MEMBER_FIRST_PASS_STATUS
                        ? '멤버 1차 합격 · 최종 합/불을 판정해 주세요'
                        : '1차 심사 마감 · 최종 합/불을 판정해 주세요'}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                  {(post.status === MEMBER_FIRST_PASS_STATUS || !post.status || post.status === '대기') ? (
                    <>
                      <button onClick={async()=>{
                        if (!window.confirm('정말 합격 처리하시겠습니까?')) return;
                        
                        try {
                          const approvedSongsBeforeSnap = await getDocs(collection(db, 'approvedSongs'));
                          const countsBeforeMilestone = approvedSongCountsByNicknameFromDocs(approvedSongsBeforeSnap.docs);

                          // 게시글 상태 업데이트
                          await updateDoc(doc(db, 'posts', post.id), { 
                            status: '합격',
                            statusUpdatedAt: new Date()
                          });
                          setPost(p=>p ? { ...p, status: '합격' } : p);
                          
                          // 합격곡 자동 등록/갱신
                          const members = Array.isArray(post.members) ? post.members.filter(Boolean) : [];
                          const allMembers = [...members, post.writerNickname].filter((v, i, arr) => !!v && arr.indexOf(v) === i);
                          const approvedQuery = query(
                            collection(db, 'approvedSongs'),
                            where('approvedPostId', '==', post.id)
                          );
                          const approvedSnap = await getDocs(approvedQuery);
                          if (approvedSnap.empty) {
                            await addDoc(collection(db, 'approvedSongs'), {
                              title: post.title,
                              titleNoSpace: post.title.replace(/\s/g, ''),
                              members: allMembers,
                              createdAt: new Date(),
                              createdBy: user?.nickname || '알 수 없음',
                              createdByRole: user?.role || '',
                              approvedPostId: post.id,
                              audioUrl: post.audioUrl || '',
                              duration: post.duration || 0,
                              fileName: post.fileName || '',
                            });
                          } else {
                            const docId = approvedSnap.docs[0].id;
                            await updateDoc(doc(db, 'approvedSongs', docId), {
                              title: post.title,
                              titleNoSpace: post.title.replace(/\s/g, ''),
                              members: allMembers,
                              updatedAt: new Date(),
                              updatedBy: user?.nickname || '알 수 없음',
                              approvedPostId: post.id,
                              audioUrl: post.audioUrl || '',
                              duration: post.duration || 0,
                              fileName: post.fileName || '',
                            });
                          }

                          const approvedSongsAfterSnap = await getDocs(collection(db, 'approvedSongs'));
                          const countsAfterMilestone = approvedSongCountsByNicknameFromDocs(approvedSongsAfterSnap.docs);
                          void notifyStaffOnApprovedSongCountMilestones({
                            countsByNicknameBefore: countsBeforeMilestone,
                            countsByNicknameAfter: countsAfterMilestone,
                            affectedNicknames: allMembers
                          }).catch((err) => console.error('합격곡 마일스톤 알림 실패:', err));

                          // 게시글 작성자에게 합격 알림 전송
                          await NotificationService.createApprovalNotification(
                            post.writerUid,
                            post.id,
                            post.title,
                            'evaluation'
                          );

                          // 듀엣 파트너들에게도 합격 알림 전송
                          if (Array.isArray(post.members) && post.members.length > 0) {
                            for (const memberNickname of post.members) {
                              if (memberNickname && memberNickname.trim() && memberNickname !== post.writerNickname) {
                                const memberUid = await findUidByNickname(memberNickname);
                                if (memberUid) {
                                  await NotificationService.createApprovalNotification(
                                    memberUid,
                                    post.id,
                                    post.title,
                                    'evaluation'
                                  );
                                }
                              }
                            }
                          }

                          alert('합격 처리가 완료되었습니다. 관련 멤버들에게 알림이 전송되었습니다.');
                        } catch(e) {
                          console.error('합격 처리 중 오류:', e);
                          alert('합격 처리 중 오류가 발생했습니다.');
                        }
                      }} style={{background:'var(--primary-color, #8b5a2b)',color:'#fff',fontWeight:700,padding:'8px 22px',borderRadius:8,border:'none',fontSize:16,cursor:'pointer'}}>합격</button>
                      
                      <button onClick={async()=>{
                        if (!window.confirm('정말 불합격 처리하시겠습니까?')) return;
                        
                        try {
                          // 게시글 상태 업데이트
                          await updateDoc(doc(db, 'posts', post.id), { 
                            status: '불합격',
                            statusUpdatedAt: new Date()
                          });
                          setPost(p=>p ? { ...p, status: '불합격' } : p);

                          // 연결된 합격곡 삭제
                          const approvedQuery = query(
                            collection(db, 'approvedSongs'),
                            where('approvedPostId', '==', post.id)
                          );
                          const approvedSnap = await getDocs(approvedQuery);
                          for (const approvedDoc of approvedSnap.docs) {
                            await deleteDoc(doc(db, 'approvedSongs', approvedDoc.id));
                          }

                          // 게시글 작성자에게 불합격 알림 전송
                          await NotificationService.createRejectionNotification(
                            post.writerUid,
                            post.id,
                            post.title,
                            'evaluation'
                          );

                          // 듀엣 파트너들에게도 불합격 알림 전송
                          if (Array.isArray(post.members) && post.members.length > 0) {
                            for (const memberNickname of post.members) {
                              if (memberNickname && memberNickname.trim() && memberNickname !== post.writerNickname) {
                                const memberUid = await findUidByNickname(memberNickname);
                                if (memberUid) {
                                  await NotificationService.createRejectionNotification(
                                    memberUid,
                                    post.id,
                                    post.title,
                                    'evaluation'
                                  );
                                }
                              }
                            }
                          }

                          alert('불합격 처리가 완료되었습니다. 관련 멤버들에게 알림이 전송되었습니다.');
                        } catch(e) {
                          console.error('불합격 처리 중 오류:', e);
                          alert('불합격 처리 중 오류가 발생했습니다.');
                        }
                      }} style={{background:'#F43F5E',color:'#fff',fontWeight:700,padding:'8px 22px',borderRadius:8,border:'none',fontSize:16,cursor:'pointer'}}>불합격</button>
                    </>
                  ) : (
                    <button onClick={async()=>{
                      const nextStatus = post.status === '합격' ? '불합격' : '합격';
                      if (!window.confirm(`정말 ${nextStatus}으로 전환하시겠습니까?`)) return;

                      try {
                        await updateDoc(doc(db, 'posts', post.id), { 
                          status: nextStatus,
                          statusUpdatedAt: new Date()
                        });
                        setPost(p=>p ? { ...p, status: nextStatus } : p);

                        if (nextStatus === '합격') {
                          const approvedSongsBeforeSnap = await getDocs(collection(db, 'approvedSongs'));
                          const countsBeforeMilestone = approvedSongCountsByNicknameFromDocs(approvedSongsBeforeSnap.docs);

                          const members = Array.isArray(post.members) ? post.members.filter(Boolean) : [];
                          const allMembers = [...members, post.writerNickname].filter((v, i, arr) => !!v && arr.indexOf(v) === i);
                          const approvedQuery = query(
                            collection(db, 'approvedSongs'),
                            where('approvedPostId', '==', post.id)
                          );
                          const approvedSnap = await getDocs(approvedQuery);
                          if (approvedSnap.empty) {
                            await addDoc(collection(db, 'approvedSongs'), {
                              title: post.title,
                              titleNoSpace: post.title.replace(/\s/g, ''),
                              members: allMembers,
                              createdAt: new Date(),
                              createdBy: user?.nickname || '알 수 없음',
                              createdByRole: user?.role || '',
                              approvedPostId: post.id,
                              audioUrl: post.audioUrl || '',
                              duration: post.duration || 0,
                              fileName: post.fileName || '',
                            });
                          } else {
                            const docId = approvedSnap.docs[0].id;
                            await updateDoc(doc(db, 'approvedSongs', docId), {
                              title: post.title,
                              titleNoSpace: post.title.replace(/\s/g, ''),
                              members: allMembers,
                              updatedAt: new Date(),
                              updatedBy: user?.nickname || '알 수 없음',
                              approvedPostId: post.id,
                              audioUrl: post.audioUrl || '',
                              duration: post.duration || 0,
                              fileName: post.fileName || '',
                            });
                          }

                          const approvedSongsAfterSnap = await getDocs(collection(db, 'approvedSongs'));
                          const countsAfterMilestone = approvedSongCountsByNicknameFromDocs(approvedSongsAfterSnap.docs);
                          void notifyStaffOnApprovedSongCountMilestones({
                            countsByNicknameBefore: countsBeforeMilestone,
                            countsByNicknameAfter: countsAfterMilestone,
                            affectedNicknames: allMembers
                          }).catch((err) => console.error('합격곡 마일스톤 알림 실패:', err));

                          await NotificationService.createApprovalNotification(
                            post.writerUid,
                            post.id,
                            post.title,
                            'evaluation'
                          );

                          if (Array.isArray(post.members) && post.members.length > 0) {
                            for (const memberNickname of post.members) {
                              if (memberNickname && memberNickname.trim() && memberNickname !== post.writerNickname) {
                                const memberUid = await findUidByNickname(memberNickname);
                                if (memberUid) {
                                  await NotificationService.createApprovalNotification(
                                    memberUid,
                                    post.id,
                                    post.title,
                                    'evaluation'
                                  );
                                }
                              }
                            }
                          }
                        } else {
                          const approvedQuery = query(
                            collection(db, 'approvedSongs'),
                            where('approvedPostId', '==', post.id)
                          );
                          const approvedSnap = await getDocs(approvedQuery);
                          for (const approvedDoc of approvedSnap.docs) {
                            await deleteDoc(doc(db, 'approvedSongs', approvedDoc.id));
                          }

                          await NotificationService.createRejectionNotification(
                            post.writerUid,
                            post.id,
                            post.title,
                            'evaluation'
                          );

                          if (Array.isArray(post.members) && post.members.length > 0) {
                            for (const memberNickname of post.members) {
                              if (memberNickname && memberNickname.trim() && memberNickname !== post.writerNickname) {
                                const memberUid = await findUidByNickname(memberNickname);
                                if (memberUid) {
                                  await NotificationService.createRejectionNotification(
                                    memberUid,
                                    post.id,
                                    post.title,
                                    'evaluation'
                                  );
                                }
                              }
                            }
                          }
                        }

                        alert(`${nextStatus}으로 전환되었습니다. 관련 멤버들에게 알림이 전송되었습니다.`);
                      } catch (e) {
                        console.error('합불 전환 중 오류:', e);
                        alert('합불 전환 중 오류가 발생했습니다.');
                      }
                    }} style={{background: post.status === '합격' ? '#F43F5E' : '#3B82F6',color:'#fff',fontWeight:700,padding:'8px 22px',borderRadius:8,border:'none',fontSize:16,cursor:'pointer'}}>
                      {post.status === '합격' ? '불합격으로 전환' : '합격으로 전환'}
                    </button>
                  )}
                  </div>
                </div>
              )}
              {/* 재심사 유지/삭제 판정 버튼 (합격곡 후처리 없음, 상태·알림만) */}
              {isEvaluationJudge(user) && post.category === 'rejudge' && (
                <div style={{margin:'18px 0 0 0', display:'flex', justifyContent:'center', gap:16}}>
                  {(!post.status || post.status === '대기') ? (
                    <>
                      <button onClick={async()=>{
                        if (!window.confirm('정말 유지 처리하시겠습니까?')) return;
                        try {
                          await updateDoc(doc(db, 'posts', post.id), {
                            status: '유지',
                            statusUpdatedAt: new Date()
                          });
                          setPost(p=>p ? { ...p, status: '유지' } : p);

                          await NotificationService.createRejudgeKeepNotification(
                            post.writerUid,
                            post.id,
                            post.title,
                            'evaluation'
                          );
                          if (Array.isArray(post.members) && post.members.length > 0) {
                            for (const memberNickname of post.members) {
                              if (memberNickname && memberNickname.trim() && memberNickname !== post.writerNickname) {
                                const memberUid = await findUidByNickname(memberNickname);
                                if (memberUid) {
                                  await NotificationService.createRejudgeKeepNotification(
                                    memberUid,
                                    post.id,
                                    post.title,
                                    'evaluation'
                                  );
                                }
                              }
                            }
                          }
                          alert('유지 처리가 완료되었습니다. 관련 멤버들에게 알림이 전송되었습니다.');
                        } catch(e) {
                          console.error('유지 처리 중 오류:', e);
                          alert('유지 처리 중 오류가 발생했습니다.');
                        }
                      }} style={{background:'var(--primary-color, #8b5a2b)',color:'#fff',fontWeight:700,padding:'8px 22px',borderRadius:8,border:'none',fontSize:16,cursor:'pointer'}}>유지</button>

                      <button onClick={async()=>{
                        if (!window.confirm('정말 삭제 처리하시겠습니까?')) return;
                        try {
                          await updateDoc(doc(db, 'posts', post.id), {
                            status: '삭제',
                            statusUpdatedAt: new Date()
                          });
                          setPost(p=>p ? { ...p, status: '삭제' } : p);

                          await NotificationService.createRejudgeRemoveNotification(
                            post.writerUid,
                            post.id,
                            post.title,
                            'evaluation'
                          );
                          if (Array.isArray(post.members) && post.members.length > 0) {
                            for (const memberNickname of post.members) {
                              if (memberNickname && memberNickname.trim() && memberNickname !== post.writerNickname) {
                                const memberUid = await findUidByNickname(memberNickname);
                                if (memberUid) {
                                  await NotificationService.createRejudgeRemoveNotification(
                                    memberUid,
                                    post.id,
                                    post.title,
                                    'evaluation'
                                  );
                                }
                              }
                            }
                          }
                          alert('삭제 처리가 완료되었습니다. 관련 멤버들에게 알림이 전송되었습니다.');
                        } catch(e) {
                          console.error('삭제 처리 중 오류:', e);
                          alert('삭제 처리 중 오류가 발생했습니다.');
                        }
                      }} style={{background:'#F43F5E',color:'#fff',fontWeight:700,padding:'8px 22px',borderRadius:8,border:'none',fontSize:16,cursor:'pointer'}}>삭제</button>
                    </>
                  ) : (
                    <button onClick={async()=>{
                      const nextStatus = post.status === '유지' ? '삭제' : '유지';
                      if (!window.confirm(`정말 ${nextStatus}으로 전환하시겠습니까?`)) return;
                      try {
                        await updateDoc(doc(db, 'posts', post.id), {
                          status: nextStatus,
                          statusUpdatedAt: new Date()
                        });
                        setPost(p=>p ? { ...p, status: nextStatus } : p);

                        if (nextStatus === '유지') {
                          await NotificationService.createRejudgeKeepNotification(
                            post.writerUid,
                            post.id,
                            post.title,
                            'evaluation'
                          );
                          if (Array.isArray(post.members) && post.members.length > 0) {
                            for (const memberNickname of post.members) {
                              if (memberNickname && memberNickname.trim() && memberNickname !== post.writerNickname) {
                                const memberUid = await findUidByNickname(memberNickname);
                                if (memberUid) {
                                  await NotificationService.createRejudgeKeepNotification(
                                    memberUid,
                                    post.id,
                                    post.title,
                                    'evaluation'
                                  );
                                }
                              }
                            }
                          }
                        } else {
                          await NotificationService.createRejudgeRemoveNotification(
                            post.writerUid,
                            post.id,
                            post.title,
                            'evaluation'
                          );
                          if (Array.isArray(post.members) && post.members.length > 0) {
                            for (const memberNickname of post.members) {
                              if (memberNickname && memberNickname.trim() && memberNickname !== post.writerNickname) {
                                const memberUid = await findUidByNickname(memberNickname);
                                if (memberUid) {
                                  await NotificationService.createRejudgeRemoveNotification(
                                    memberUid,
                                    post.id,
                                    post.title,
                                    'evaluation'
                                  );
                                }
                              }
                            }
                          }
                        }
                        alert(`${nextStatus}으로 전환되었습니다. 관련 멤버들에게 알림이 전송되었습니다.`);
                      } catch (e) {
                        console.error('재심사 전환 중 오류:', e);
                        alert('재심사 전환 중 오류가 발생했습니다.');
                      }
                    }} style={{background: post.status === '유지' ? '#F43F5E' : '#3B82F6',color:'#fff',fontWeight:700,padding:'8px 22px',borderRadius:8,border:'none',fontSize:16,cursor:'pointer'}}>
                      {post.status === '유지' ? '삭제로 전환' : '유지로 전환'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="post-detail-footer">
            <div className="post-stats">
              <button 
                onClick={handleLike}
                className={`stat-button ${user && post.likes && post.likes.includes(user.uid) ? ' liked' : ''}`}
                disabled={!user}
                title={user ? '좋아요' : '로그인이 필요합니다'}
              >
                <Heart 
                  size={20} 
                  fill={user && post.likes && post.likes.includes(user.uid) ? 'currentColor' : 'none'} 
                />
                <span>{post.likesCount || 0}</span>
              </button>
              
              <button className="message-btn" onClick={() => setShowMessageModal(true)}>
                <MessageSquare size={18} /> 쪽지
              </button>
              
              <button 
                onClick={handleDelete} 
                className="action-button"
              >
                <Trash size={20} />
                삭제
              </button>
            </div>
            
            {canEditPost && (
              <div className="post-actions">
                <button 
                  onClick={handleEdit} 
                  className="action-button"
                >
                  <Edit size={20} />
                  수정
                </button>
              </div>
            )}
          </div>
        </article>

        {/* 댓글 영역 */}
        {post && (
          <CommentSection
            postId={post.id}
            user={user}
            post={post}
            boardType="evaluation"
          />
        )}

        {/* 쪽지 모달 */}
        {showMessageModal && (
          <div className="modal-overlay" onClick={() => setShowMessageModal(false)}>
            <div className="message-modal" onClick={e => e.stopPropagation()}>
              <h3>{post.writerNickname}님에게 쪽지 보내기</h3>
              <textarea
                value={messageContent}
                onChange={e => setMessageContent(e.target.value)}
                placeholder="쪽지 내용을 입력하세요..."
              />
              <div className="modal-buttons">
                <button onClick={() => setShowMessageModal(false)}>취소</button>
                <button onClick={() => {
                  // 쪽지 전송 로직
                  setShowMessageModal(false);
                  setMessageContent('');
                }}>전송</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
};

// 오디오 플레이어 컴포넌트
function AudioPlayer({ audioUrl, duration }: { audioUrl: string, duration?: number }) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [audioDuration, setAudioDuration] = React.useState(duration || 0);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const location = useLocation();

  // window에 audioPlayerRef 등록
  useEffect(() => {
    window.audioPlayerRef = audioRef.current;
    return () => {
      if (window.audioPlayerRef === audioRef.current) {
        window.audioPlayerRef = null;
      }
    };
  }, [audioUrl]);

  // 라우트 변경 시 오디오 일시정지
  useEffect(() => {
    stopBoardAudio();
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setAudioDuration(audio.duration);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [audioUrl]);

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      stopBoardAudio();
      setIsPlaying(false);
    } else {
      stopBoardAudio();
      void audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="audio-player" style={{marginBottom:8}}>
      <button onClick={handlePlayPause} className="audio-play-btn">
        {isPlaying ? <Pause size={32} /> : <Play size={32} />}
      </button>
      <div style={{ flex: 1, margin: '0 16px', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--primary-color, #8b5a2b)', minWidth: 38 }}>{formatTime(currentTime)}</span>
        <div
          className="audio-progress-bar"
          style={{ flex: 1, height: 8, background: '#E5DAF5', borderRadius: 4, margin: '0 8px', cursor: 'pointer', position: 'relative' }}
          onClick={e => {
            const bar = e.currentTarget;
            const rect = bar.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = x / rect.width;
            if (audioRef.current && audioDuration) {
              audioRef.current.currentTime = percent * audioDuration;
              setCurrentTime(percent * audioDuration);
            }
          }}
        >
          <div
            style={{
              width: audioDuration ? `${(currentTime / audioDuration) * 100}%` : '0%',
              height: '100%',
              background: 'linear-gradient(90deg, var(--primary-color, #8b5a2b) 60%, var(--primary-light, #a07040) 100%)',
              borderRadius: 4,
              transition: 'width 0.1s',
            }}
          />
        </div>
        <span style={{ fontSize: 13, color: 'var(--primary-color, #8b5a2b)', minWidth: 38 }}>{formatTime(audioDuration || duration || 0)}</span>
      </div>
      <audio ref={audioRef} src={audioUrl} preload="auto" />
    </div>
  );
}

export default EvaluationPostDetail; 