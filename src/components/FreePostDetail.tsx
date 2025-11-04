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
import { 
  ArrowLeft, 
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
}

interface User {
  uid: string;
  email: string;
  nickname?: string;
  role?: string;
  isLoggedIn: boolean;
}

const categories: Category[] = [
  { id: 'general', name: '일반' },
  { id: 'question', name: '질문' },
  { id: 'share', name: '정보공유' },
  { id: 'discussion', name: '토론' },
  { id: 'request', name: '신청곡' },
];

// 등급 이모지 매핑 - 체리만 사용
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

const FreePostDetail: React.FC = () => {
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

  // 등급 이모지 매핑 함수
  const getGradeEmoji = (grade: string) => {
    if (gradeEmojis.includes(grade)) {
      return grade;
    }
    return gradeToEmoji[grade] || '🍒';
  };

  // 등급 이름 가져오기
  const getGradeName = (emoji: string) => {
    return emojiToGrade[emoji] || '체리';
  };

  // 사용자 정보 로드
  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      const userData = JSON.parse(userString);
      setUser(userData);
    }
  }, []);

  // 작성자 정보 실시간 업데이트
  useEffect(() => {
    if (!post?.writerUid) return;

    const userRef = doc(db, 'users', post.writerUid);
    const unsubscribe = onSnapshot(userRef, (userDoc) => {
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setPost(prevPost => {
          if (!prevPost) return null;
          // 기존 데이터를 보존하면서 작성자 정보만 업데이트
          return {
            ...prevPost,
            writerGrade: userData.grade || prevPost.writerGrade || '🍒',
            writerRole: userData.role || prevPost.writerRole || '일반',
            writerPosition: userData.position || prevPost.writerPosition || ''
          };
        });
      }
    }, (error) => {
      console.error('작성자 정보 구독 에러:', error);
    });

    return () => unsubscribe();
  }, [post?.writerUid]);

  // 게시글 데이터 로드 및 구독
  useEffect(() => {
    if (!id) {
      navigate('/free');
      return;
    }

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

    // 실시간 게시글 데이터 구독
    const unsubscribe = onSnapshot(
      doc(db, 'posts', id),
      (docSnapshot) => {
        if (!docSnapshot.exists()) {
          setPost(null);
          setLoading(false);
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
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        setPost(null);
      }
    );
    return () => unsubscribe();
  }, [id, navigate]);

  // 북마크 상태 관리
  useEffect(() => {
    if (user && post) {
      setIsBookmarked(post.bookmarks?.includes(user.uid) || false);
    }
  }, [user, post]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
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

  const handleLike = async () => {
    if (!user || !post) {
      alert('로그인이 필요합니다.');
      return;
    }

    try {
      const isLiked = post.likes.includes(user.uid);
      const postRef = doc(db, 'posts', post.id);

      await updateDoc(postRef, {
        likes: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
        likesCount: increment(isLiked ? -1 : 1)
      });
    } catch (error) {
      console.error('좋아요 처리 에러:', error);
      alert('좋아요 처리 중 오류가 발생했습니다.');
    }
  };

  const handleBookmark = async () => {
    if (!user || !post) {
      alert('로그인이 필요합니다.');
      return;
    }

    try {
      const postRef = doc(db, 'posts', post.id);
      
      if (isBookmarked) {
        await updateDoc(postRef, {
          bookmarks: arrayRemove(user.uid)
        });
      } else {
        await updateDoc(postRef, {
          bookmarks: arrayUnion(user.uid)
        });
      }
      setIsBookmarked(!isBookmarked);
    } catch (error) {
      console.error('북마크 처리 에러:', error);
      alert('북마크 처리 중 오류가 발생했습니다.');
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert('게시글 링크가 복사되었습니다.');
    } catch (error) {
      console.error('공유 링크 복사 에러:', error);
      alert('링크 복사 중 오류가 발생했습니다.');
    }
  };

  const handleReport = async () => {
    if (!user || !post) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (!reportReason.trim()) {
      alert('신고 사유를 입력해주세요.');
      return;
    }

    try {
      setIsSubmittingReport(true);
      const postRef = doc(db, 'posts', post.id);
      
      // 이미 신고한 경우 체크
      if (post.reports?.includes(user.uid)) {
        alert('이미 신고한 게시글입니다.');
        return;
      }

      await updateDoc(postRef, {
        reports: arrayUnion(user.uid),
        reportCount: increment(1)
      });

      // 신고 내역 저장
      await addDoc(collection(db, 'reports'), {
        postId: post.id,
        reporterUid: user.uid,
        reporterNickname: user.nickname,
        reason: reportReason,
        createdAt: serverTimestamp()
      });

      setShowReportModal(false);
      setReportReason('');
      alert('신고가 접수되었습니다.');
    } catch (error) {
      console.error('게시글 신고 에러:', error);
      alert('신고 처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleEdit = () => {
    navigate(`/free/edit/${post?.id}`);
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
        navigate('/free');
      } catch (error) {
        console.error('게시글 삭제 에러:', error);
        alert('게시글 삭제 중 오류가 발생했습니다.');
      }
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
            onClick={() => navigate('/free')}
          >
            목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const isLiked = user ? post.likes.includes(user.uid) : false;
  const canEdit = user && user.uid === post.writerUid;
  const canDelete = user && (user.uid === post.writerUid || user.nickname === '너래' || user.role === '운영진' || user.role === '리더');

  const authorBlock = (
    <>
      <span className="author-info" onClick={() => navigate(`/mypage/${post.writerUid}`)}>
        <span className="author-grade-emoji" title={getGradeName(post.writerGrade || '🍒')}>
          {getGradeEmoji(post.writerGrade || '🍒')}
        </span>
        {post.writerNickname}
      </span>
      <span className={`role-badge ${post.writerRole || '일반'}`}>
        {post.writerRole || '일반'}
      </span>
      {post.writerPosition && (
        <span className="author-position">{post.writerPosition}</span>
      )}
    </>
  );

  const infoBlock = (
    <>
      <span className="post-detail-date">
        <Clock size={16} />
        {formatDate(post.createdAt)}
      </span>
      <span className="post-detail-views">
        <Eye size={16} />
        조회 {post.views || 0}
      </span>
    </>
  );

  return (
    <div className="post-detail-container">
      <div className="post-navigation glassmorphism">
        <button className="back-button glassmorphism" onClick={() => navigate('/free')}>
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
                {authorBlock}
              </div>
              <div className="post-detail-info">
                {infoBlock}
              </div>
            </div>
          </div>
        </div>

        <div className="post-detail-content">
          {post.category === 'request' && post.content.startsWith('신청 대상:') && (
            <div style={{background:'#F6F2FF',color:'#8A55CC',borderRadius:8,padding:'10px 0',marginBottom:16,fontWeight:600,fontSize:'1.08rem',textAlign:'center'}}>
              {(() => {
                const match = post.content.match(/^신청 대상: (.+)/);
                return match ? `"${match[1].split('\n')[0]}"에게 신청곡이 들어왔어요!` : '신청곡이 들어왔어요!';
              })()}
            </div>
          )}
          <div>
            {post.category === 'request' && post.content.startsWith('신청 대상:')
              ? post.content.split('\n').slice(1).map((line, index) => <p key={index}>{line}</p>)
              : post.content.split('\n').map((line, index) => <p key={index}>{line}</p>)}
          </div>
        </div>
        
        <div className="post-detail-footer">
          <div className="post-stats">
            <button 
              onClick={handleLike}
              className={`stat-button ${isLiked ? 'liked' : ''}`}
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
          </div>
          
          <div className="post-actions">
            {canEdit && (
              <button 
                onClick={handleEdit} 
                className="action-button"
              >
                <Edit size={20} />
                수정
              </button>
            )}
          </div>
        </div>
      </article>

      {/* 신고 모달 */}
      {showReportModal && (
        <div className="modal-overlay">
          <div className="report-modal">
            <div className="modal-header">
              <h3>게시글 신고</h3>
              <button 
                className="close-button"
                onClick={() => {
                  setShowReportModal(false);
                  setReportReason('');
                }}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-content">
              <textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="신고 사유를 자세히 입력해주세요... (Shift+Enter로 줄바꿈)"
                className="report-textarea"
                rows={4}
                style={{
                  resize: 'none',
                  overflow: 'hidden',
                  minHeight: '120px',
                  maxHeight: '250px',
                  lineHeight: '1.4'
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(Math.max(target.scrollHeight, 120), 250) + 'px';
                }}
              />
            </div>
            
            <div className="modal-footer">
              <button 
                className="cancel-button"
                onClick={() => {
                  setShowReportModal(false);
                  setReportReason('');
                }}
                disabled={isSubmittingReport}
              >
                취소
              </button>
              <button 
                className="submit-button"
                onClick={handleReport}
                disabled={isSubmittingReport || !reportReason.trim()}
              >
                {isSubmittingReport ? (
                  <>
                    <Loader className="spinner" size={16} />
                    처리 중...
                  </>
                ) : (
                  '신고하기'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 쪽지 모달 */}
      {showMessageModal && (
        <div className="modal-overlay" onClick={() => setShowMessageModal(false)}>
          <div className="message-modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 360, margin: '120px auto', boxShadow: '0 8px 32px #E5DAF5' }}>
            <h3 style={{ color: '#8A55CC', fontWeight: 700, marginBottom: 16 }}>{post.writerNickname}님에게 쪽지 보내기</h3>
            <textarea
              value={messageContent}
              onChange={e => setMessageContent(e.target.value)}
              placeholder="쪽지 내용을 입력하세요... (Shift+Enter로 줄바꿈)"
              style={{ 
                width: '100%', 
                minHeight: 80, 
                maxHeight: 200,
                borderRadius: 8, 
                border: '1px solid #E5DAF5', 
                padding: 12, 
                marginBottom: 16,
                resize: 'none',
                overflow: 'hidden',
                lineHeight: '1.4',
                fontFamily: 'inherit'
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(Math.max(target.scrollHeight, 80), 200) + 'px';
              }}
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowMessageModal(false)} style={{ background: '#eee', border: 'none', borderRadius: 8, padding: '8px 18px', color: '#8A55CC', fontWeight: 600, cursor: 'pointer' }}>취소</button>
              <button onClick={async () => {
                if (!messageContent.trim()) return alert('쪽지 내용을 입력하세요.');
                await addDoc(collection(db, 'messages'), {
                  fromUid: user?.uid,
                  fromNickname: user?.nickname,
                  toUid: post.writerUid,
                  toNickname: post.writerNickname,
                  content: messageContent.trim(),
                  createdAt: serverTimestamp(),
                  isRead: false
                });
                setShowMessageModal(false);
                setMessageContent('');
                alert('쪽지를 보냈습니다.');
              }} style={{ background: '#8A55CC', border: 'none', borderRadius: 8, padding: '8px 18px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>보내기</button>
            </div>
          </div>
        </div>
      )}

      {/* 댓글 영역 카드화 */}
      <div className="comment-section-container">
        <CommentSection postId={post.id} user={user} post={{ id: post.id, title: post.title, writerUid: post.writerUid, writerNickname: post.writerNickname }} />
      </div>
    </div>
  );
};

export default FreePostDetail; 