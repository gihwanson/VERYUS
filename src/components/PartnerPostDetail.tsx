import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  increment, 
  arrayUnion, 
  arrayRemove,
  onSnapshot,
  addDoc,
  collection,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import CommentSection from './CommentSection';
import { NotificationService } from '../utils/notificationService';
import { getPublicRoleBadge, shouldShowPublicPosition } from '../utils/publicRoleBadge';
import { 
  ArrowLeft, 
  UserPlus, 
  Heart, 
  Edit, 
  Trash2, 
  Share2, 
  Bookmark,
  Flag,
  Loader,
  AlertTriangle,
  User,
  Clock,
  Eye,
  X,
  MessageSquare
} from 'lucide-react';
import '../styles/PostDetail.css';
import '../styles/BoardLayout.css';

interface Category {
  id: string;
  name: string;
}

interface Post {
  id: string;
  title: string;
  content: string;
  writerNickname: string;
  writerUid: string;
  writerGrade?: string;
  writerRole?: string;
  writerPosition?: string;
  createdAt: any;
  likes: string[];
  likesCount: number;
  commentCount: number;
  bookmarks?: string[];
  reports?: string[];
  reportCount?: number;
  views: number;
  category?: string;
  applicants?: string[];
  isClosed?: boolean;
  closedAt?: any;
  lastBumpedAt?: any;
}

interface User {
  uid: string;
  email: string;
  nickname?: string;
  role?: string;
  isLoggedIn: boolean;
}

const categories: Category[] = [
  { id: 'vocal', name: '보컬' },
  { id: 'etc', name: '세션' },
  { id: 'etc2', name: '기타' }
];

const gradeEmojis = ['🍒'];
const gradeToEmoji: { [key: string]: string } = {
  '체리': '🍒',
  '블루베리': '🍒',
  '키위': '🍒',
  '사과': '🍒',
  '멜론': '🍒',
  '수박': '🍒',
  '지구': '🍒',
  '토성': '🍒',
  '태양': '🍒',
  '은하': '🍒',
  '맥주': '🍒',
  '번개': '🍒',
  '별': '🍒',
  '달': '🍒'
};
const emojiToGrade: { [key: string]: string } = {
  '🍒': '체리',
  '🫐': '체리',
  '🥝': '체리',
  '🍎': '체리',
  '🍈': '체리',
  '🍉': '체리',
  '🌍': '체리',
  '🪐': '체리',
  '☀️': '체리',
  '🌌': '체리',
  '🍺': '체리',
  '⚡': '체리',
  '⭐': '체리',
  '🌙': '체리'
};

const categoryNameMap: { [key: string]: string } = {
  'vocal': '보컬',
  'etc': '세션',
  'etc2': '기타',
};

const PartnerPostDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageContent, setMessageContent] = useState('');
  const [applicants, setApplicants] = useState<string[]>([]);
  const [isClosed, setIsClosed] = useState(false);
  const [closedAt, setClosedAt] = useState<any>(null);
  const [applicantUsers, setApplicantUsers] = useState<any[]>([]);
  const [showApplicantsModal, setShowApplicantsModal] = useState(false);
  const [isBumping, setIsBumping] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const getGradeEmoji = (grade: string) => {
    return '🍒';
  };

  const getGradeName = (emoji: string) => {
    return '체리';
  };

  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      const userData = JSON.parse(userString);
      setUser(userData);
    }
  }, []);

  useEffect(() => {
    if (!post?.writerUid) return;
    const userRef = doc(db, 'users', post.writerUid);
    const unsubscribe = onSnapshot(userRef, (userDoc) => {
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setPost(prevPost => {
          if (!prevPost) return null;
          return {
            ...prevPost,
            writerGrade: userData.grade || '🍒',
            writerRole: userData.role || '일반',
            writerPosition: userData.position || ''
          };
        });
      }
    });
    return () => unsubscribe();
  }, [post?.writerUid]);

  useEffect(() => {
    if (!id) {
      navigate('/boards/partner');
      return;
    }
    setLoadError(null);

    // 조회수 증가 - 세션당 한 번만
    const incrementViews = async () => {
      const viewedPosts = sessionStorage.getItem('viewedPartnerPosts');
      const viewedPostsArray = viewedPosts ? JSON.parse(viewedPosts) : [];
      if (!viewedPostsArray.includes(id)) {
        try {
          await updateDoc(doc(db, 'posts', id), {
            views: increment(1)
          });
          sessionStorage.setItem('viewedPartnerPosts', JSON.stringify([...viewedPostsArray, id]));
        } catch (error) {
          console.error('조회수 업데이트 에러:', error);
        }
      }
    };
    incrementViews();

    // 실시간 게시글 데이터 구독
    const unsubscribe = onSnapshot(doc(db, 'posts', id), async (docSnapshot) => {
      if (!docSnapshot.exists() || docSnapshot.data().type !== 'partner') {
        setPost(null);
        setLoading(false);
        setLoadError('게시글을 찾을 수 없습니다.');
        return;
      }
      const data = docSnapshot.data();
      setPost(prev => {
        return {
          ...(prev || {}),
          ...data,
          id: docSnapshot.id,
          likes: Array.isArray(data.likes) ? data.likes : [],
        } as Post;
      });
      setApplicants(data.applicants || []);
      setIsClosed(data.isClosed || false);
      setClosedAt(data.closedAt || null);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      setPost(null);
      setLoadError('게시글을 불러오는 중 오류가 발생했습니다.');
    });
    return () => unsubscribe();
  }, [id, navigate]);

  useEffect(() => {
    if (!user || !post || !applicants.length || user.uid !== post.writerUid) return;
    Promise.all(applicants.map(async (uid) => {
      const userDoc = await getDoc(doc(db, 'users', uid));
      return userDoc.exists() ? { uid, ...userDoc.data() } : null;
    }))
      .then((users) => setApplicantUsers(users.filter(Boolean)))
      .catch((error) => {
        console.error('지원자 정보 로드 실패:', error);
        setApplicantUsers([]);
      });
  }, [user, post, applicants]);

  if (loading) {
    return (
      <div className="board-container">
        <div className="loading-container">
          <Loader className="loading-spinner" />
          게시글을 불러오는 중...
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="board-container">
        <div className="error-container">
          <AlertTriangle size={48} />
          <h3>{loadError || '게시글을 찾을 수 없습니다.'}</h3>
          <button
            className="back-button"
            onClick={() => navigate('/boards/partner')}
          >
            목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (date: Date | any) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    const now = new Date();
    const diffTime = now.getTime() - d.getTime();
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffMinutes < 60) {
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

  if (loading) {
    return (
      <div className="board-container">
        <div className="loading-container">
          <Loader className="loading-spinner" />
          게시글을 불러오는 중...
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="board-container">
        <div className="error-container">
          <AlertTriangle size={48} />
          <h3>게시글을 찾을 수 없습니다.</h3>
          <button 
            className="back-button"
            onClick={() => navigate('/boards/partner')}
          >
            목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const isLiked = post.likes.includes(user?.uid || '');
  const canEdit = user && user.uid === post.writerUid;
  const canDelete = user && (user.uid === post.writerUid || user.nickname === '너래' || user.role === '운영진' || user.role === '리더');
  const canBump = !!(user && user.uid === post.writerUid && !isClosed);

  const BUMP_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

  const toMs = (value: any) => {
    if (!value) return 0;
    if (value?.toDate) return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const lastBumpTimeMs = toMs(post.lastBumpedAt) || toMs(post.createdAt);
  const nextBumpAtMs = lastBumpTimeMs + BUMP_COOLDOWN_MS;
  const remainingBumpMs = Math.max(0, nextBumpAtMs - Date.now());
  const canBumpNow = remainingBumpMs === 0;

  const formatRemainingBumpTime = (ms: number) => {
    if (ms <= 0) return '지금 끌어올릴 수 있습니다.';
    const totalMinutes = Math.ceil(ms / (1000 * 60));
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `${days}일 ${hours}시간 후 가능`;
    if (hours > 0) return `${hours}시간 ${minutes}분 후 가능`;
    return `${minutes}분 후 가능`;
  };

  const handleApply = async () => {
    if (!user || !post) return;
    if (isClosed) return;
    const hasApplied = applicants.includes(user.uid);
    if (!hasApplied) {
      if (!window.confirm('지원하시겠습니까?')) return;
      try {
        await updateDoc(doc(db, 'posts', post.id), {
          applicants: arrayUnion(user.uid)
        });
        setApplicants(prev => [...prev, user.uid]);
        
        // 지원 시 게시글 작성자에게 알림 보내기
        try {
          await NotificationService.createNotification({
            type: 'partnership',
            toUid: post.writerUid,
            fromUid: user.uid,
            fromNickname: user.nickname || '익명',
            postId: post.id,
            postTitle: post.title,
            postType: 'partner',
            message: '파트너 신청이 있습니다.'
          });
        } catch (notificationError) {
          console.error('지원 알림 생성 실패:', notificationError);
        }
      } catch (error) {
        console.error('지원 신청 중 오류:', error);
        alert('지원 신청 중 오류가 발생했습니다.');
      }
    } else {
      if (!window.confirm('지원을 취소하겠습니까?')) return;
      try {
        await updateDoc(doc(db, 'posts', post.id), {
          applicants: arrayRemove(user.uid)
        });
        setApplicants(prev => prev.filter(uid => uid !== user.uid));
      } catch (error) {
        console.error('지원 취소 중 오류:', error);
        alert('지원 취소 중 오류가 발생했습니다.');
      }
    }
  };

  const handleConfirmApplicant = async (applicantUid: string, applicantNickname: string) => {
    if (!post || !user) return;
    
    if (!window.confirm(`${applicantNickname}님을 파트너로 확정하시겠습니까?`)) return;
    
    try {
      // 확정된 지원자에게 알림 보내기
      await NotificationService.createPartnershipConfirmedNotification(
        applicantUid,
        post.id,
        post.title,
        user.nickname || '익명',
        user.uid
      );
      
      alert(`${applicantNickname}님을 파트너로 확정했습니다.`);
    } catch (error) {
      console.error('파트너 확정 처리 중 오류:', error);
      alert('파트너 확정 처리 중 오류가 발생했습니다.');
    }
  };

  const handleClose = async () => {
    if (!post || !user) return;
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        isClosed: true,
        closedAt: serverTimestamp()
      });
      setIsClosed(true);
      
      // 모든 지원자들에게 모집 완료 알림 보내기
      if (applicants.length > 0) {
        try {
          const notificationPromises = applicants.map(applicantUid => 
            NotificationService.createPartnershipClosedNotification(
              applicantUid,
              post.id,
              post.title,
              user.nickname || '익명',
              user.uid
            )
          );
          await Promise.all(notificationPromises);
        } catch (notificationError) {
          console.error('모집 완료 알림 생성 실패:', notificationError);
        }
      }
    } catch (error) {
      console.error('모집 완료 처리 중 오류:', error);
      alert('모집 완료 처리 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async () => {
    if (!post || !user) return;
    if (user.uid !== post.writerUid && user.nickname !== '너래' && user.role !== '운영진' && user.role !== '리더') {
      alert('삭제 권한이 없습니다.');
      return;
    }
    if (window.confirm('정말로 이 게시글을 삭제하시겠습니까?')) {
      try {
        await deleteDoc(doc(db, 'posts', post.id));
        alert('게시글이 삭제되었습니다.');
        navigate('/boards/partner');
      } catch (error) {
        console.error('게시글 삭제 에러:', error);
        alert('게시글 삭제 중 오류가 발생했습니다.');
      }
    }
  };

  const handleLike = async () => {
    if (!user || !post) return;
    const likesArr = Array.isArray(post.likes) ? post.likes : [];
    const isLiked = likesArr.includes(user.uid);
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        likes: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
        likesCount: isLiked ? (post.likesCount || 0) - 1 : (post.likesCount || 0) + 1
      });
    } catch (error) {
      alert('좋아요 처리 중 오류가 발생했습니다.');
    }
  };

  const handleBumpPost = async () => {
    if (!post || !user) return;
    if (post.writerUid !== user.uid) {
      alert('내 게시글만 끌어올릴 수 있습니다.');
      return;
    }
    if (isClosed) {
      alert('모집완료된 글은 끌어올릴 수 없습니다.');
      return;
    }
    if (!canBumpNow) {
      alert(`아직 끌어올릴 수 없습니다. ${formatRemainingBumpTime(remainingBumpMs)}`);
      return;
    }

    if (!window.confirm('게시글을 맨 위로 끌어올릴까요?')) return;

    try {
      setIsBumping(true);
      await updateDoc(doc(db, 'posts', post.id), {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastBumpedAt: serverTimestamp()
      });
      alert('게시글을 끌어올렸습니다.');
    } catch (error) {
      console.error('끌어올리기 실패:', error);
      alert('끌어올리기 중 오류가 발생했습니다.');
    } finally {
      setIsBumping(false);
    }
  };

  return (
    <div className="post-detail-container">
      <div className="post-navigation glassmorphism">
        <button className="back-button glassmorphism" onClick={() => navigate('/boards/partner')}>
          <ArrowLeft size={20} />
          목록으로
        </button>
      </div>
      <article className="post-detail">
        <div className="post-detail-header">
          <div className="title-container">
            <div className="title-section">
              {post.category && <span className="category-tag">{categories.find(c => c.id === post.category)?.name || '일반'}</span>}
              <h1 className="post-detail-title">
                {post.title}
              </h1>
            </div>
          </div>
          <div className="post-detail-meta">
            <div className="post-detail-author">
              <div className="author-section">
                <span className="author-info" onClick={() => navigate(`/mypage/${post.writerUid}`)}>
                  <span className="author-grade-emoji" title={getGradeName(post.writerGrade || '🍒')}>
                    {getGradeEmoji(post.writerGrade || '🍒')}
                  </span>
                  {post.writerNickname}
                </span>
                <span className={`role-badge ${getPublicRoleBadge(post.writerRole, post.writerPosition)}`}>
                  {getPublicRoleBadge(post.writerRole, post.writerPosition)}
                </span>
                {shouldShowPublicPosition(post.writerPosition) && (
                  <span className="author-position">{post.writerPosition}</span>
                )}
              </div>
              <div className="post-detail-info">
                <span className="post-detail-date">
                  <Clock size={16} />
                  {formatDate(post.createdAt)}
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
          {post.content.split('\n').map((line, index) => (
            <p key={index}>{line}</p>
          ))}
          {isClosed && (
            <div style={{marginTop:'1.5rem',padding:'1rem',background:'#F6F2FF',color:'#8A55CC',fontWeight:600,borderRadius:8,fontSize:'1.05rem',textAlign:'center'}}>
              (해당 게시글은 모집이 완료된 게시글입니다)
            </div>
          )}
          
          {/* 지원하기 버튼을 본문 바로 밑으로 이동 */}
          {!isClosed && user && post.writerUid !== user.uid && (
            <div style={{marginTop:'1.5rem',textAlign:'center'}}>
              <button 
                className="apply-btn"
                style={{background: applicants.includes(user.uid) ? '#eee' : '#8A55CC', color: applicants.includes(user.uid) ? '#aaa' : '#fff', fontWeight:700, fontSize:'1.1rem', borderRadius:12, padding:'1rem 2rem', border:'none', boxShadow:'0 4px 16px rgba(124,58,237,0.2)', cursor:'pointer', transition:'all 0.3s ease'}}
                onClick={handleApply}
                onMouseEnter={(e) => {
                  if (!applicants.includes(user.uid)) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(124,58,237,0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,58,237,0.2)';
                }}
              >
                {applicants.includes(user.uid) ? '지원 완료 (취소)' : '지원하기'}
              </button>
            </div>
          )}
        </div>
        <div className="post-detail-footer">
          <div className="post-stats">
            <button 
              onClick={handleLike}
              className={`stat-button${isLiked ? ' liked' : ''}`}
              disabled={!user}
              title={user ? '좋아요' : '로그인이 필요합니다'}
            >
              <Heart 
                size={20} 
                fill={isLiked ? 'currentColor' : 'none'}
              />
              <span>{post.likesCount || 0}</span>
            </button>
            
            <button className="message-btn" onClick={() => setShowMessageModal(true)}>
              <MessageSquare size={18} /> 쪽지
            </button>
            
            {canDelete && (
              <button 
                onClick={handleDelete}
                className="action-button"
              >
                <Trash2 size={20} />
                삭제
              </button>
            )}
            {/* 모집완료/지원자보기 버튼: 작성자만, 모집중일 때만 노출 */}
            {user && post.writerUid === user.uid && !isClosed && (
              <div className="partner-owner-actions">
                <button
                  className="action-button partner-owner-action-btn"
                  onClick={handleBumpPost}
                  disabled={!canBump || !canBumpNow || isBumping}
                  style={{
                    opacity: !canBumpNow || isBumping ? 0.6 : 1,
                    cursor: !canBumpNow || isBumping ? 'not-allowed' : 'pointer'
                  }}
                  title={canBumpNow ? '게시글 끌어올리기' : `다음 가능: ${formatRemainingBumpTime(remainingBumpMs)}`}
                >
                  {isBumping ? '처리 중...' : '끌어올리기'}
                </button>
                <button 
                  className="close-btn partner-owner-action-btn"
                  style={{ background:'#8A55CC', color:'#fff', fontWeight:700, fontSize:'1.05rem', borderRadius:8, padding:'0.7rem 1.5rem', border:'none', boxShadow:'0 2px 8px rgba(124,58,237,0.12)', cursor:'pointer'}}
                  onClick={() => {
                    if(window.confirm('정말 모집완료 하겠습니까?')) handleClose();
                  }}
                >
                  파트너 모집완료
                </button>
                <button
                  className="applicants-btn partner-owner-action-btn"
                  style={{ background:'#fff', color:'#8A55CC', fontWeight:700, fontSize:'1.05rem', borderRadius:8, padding:'0.7rem 1.5rem', border:'2px solid #8A55CC', boxShadow:'0 2px 8px rgba(124,58,237,0.08)', cursor:'pointer'}}
                  onClick={() => setShowApplicantsModal(true)}
                >
                  지원자보기
                </button>
              </div>
            )}
            {user && post.writerUid === user.uid && isClosed && (
              <span className="closed-badge" style={{marginLeft:24, color:'#8A55CC', fontWeight:600}}>모집완료</span>
            )}
          </div>
          <div className="post-actions">
            {canEdit && (
              <button 
                onClick={() => navigate(`/boards/partner/edit/${post.id}`)}
                className="action-button"
              >
                <Edit size={20} />
                수정
              </button>
            )}
          </div>
        </div>
      </article>
      <CommentSection postId={post.id} user={user} post={{ id: post.id, title: post.title, writerUid: post.writerUid, writerNickname: post.writerNickname }} />
      {/* 지원자 모달 */}
      {showApplicantsModal && (
        <div className="modal-overlay" style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.25)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div className="modal-content" style={{background:'#fff',borderRadius:12,padding:'2rem',minWidth:400,maxWidth:500,boxShadow:'0 4px 24px rgba(0,0,0,0.12)',position:'relative'}}>
            <button style={{position:'absolute',top:12,right:12,background:'none',border:'none',fontSize:20,cursor:'pointer'}} onClick={()=>setShowApplicantsModal(false)}><X size={24}/></button>
            <h3 style={{marginBottom:16,fontWeight:700,fontSize:'1.15rem'}}>지원자 목록</h3>
            {applicantUsers.length === 0 ? (
              <p style={{color:'#888'}}>아직 지원자가 없습니다.</p>
            ) : (
              <ul style={{padding:0,listStyle:'none'}}>
                {applicantUsers.map(u => (
                  <li key={u.uid} style={{
                    marginBottom:12, 
                    display:'flex', 
                    alignItems:'center', 
                    justifyContent:'space-between', 
                    padding:'8px 12px', 
                    background:'#F8F9FA', 
                    borderRadius:8,
                    border:'1px solid #E9ECEF'
                  }}>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <span style={{fontWeight:600, color:'#495057'}}>
                        {u.nickname || u.email}
                      </span>
                      {u.grade && (
                        <span style={{fontSize:'1.1rem'}} title={u.grade}>
                          {u.grade}
                        </span>
                      )}
                      {u.role && u.role !== '일반' && (
                        <span style={{
                          fontSize:'11px',
                          background:'#8A55CC',
                          color:'white',
                          padding:'2px 6px',
                          borderRadius:4,
                          fontWeight:600
                        }}>
                          {u.role}
                        </span>
                      )}
                    </div>
                    <button 
                      onClick={() => handleConfirmApplicant(u.uid, u.nickname || u.email)}
                      style={{
                        background:'#10B981',
                        color:'white',
                        border:'none',
                        borderRadius:6,
                        padding:'4px 12px',
                        fontSize:'12px',
                        fontWeight:600,
                        cursor:'pointer',
                        transition:'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#059669';
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#10B981';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      확정
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PartnerPostDetail; 