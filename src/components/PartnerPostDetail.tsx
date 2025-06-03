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
import './FreePostDetail.css';

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

const gradeEmojis = ['🍒', '🫐', '🥝', '🍎', '🍈', '🍉', '🌍', '🪐', '☀️', '🌌', '🍺', '⚡', '⭐', '🌙'];
const gradeToEmoji: { [key: string]: string } = {
  '체리': '🍒',
  '블루베리': '🫐',
  '키위': '🥝',
  '사과': '🍎',
  '멜론': '🍈',
  '수박': '🍉',
  '지구': '🌍',
  '토성': '🪐',
  '태양': '☀️',
  '은하': '🌌',
  '맥주': '🍺',
  '번개': '⚡',
  '별': '⭐',
  '달': '🌙'
};
const emojiToGrade: { [key: string]: string } = {
  '🍒': '체리',
  '🫐': '블루베리',
  '🥝': '키위',
  '🍎': '사과',
  '🍈': '멜론',
  '🍉': '수박',
  '🌍': '지구',
  '🪐': '토성',
  '☀️': '태양',
  '🌌': '은하',
  '🍺': '맥주',
  '⚡': '번개',
  '⭐': '별',
  '🌙': '달'
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

  const getGradeEmoji = (grade: string) => {
    if (gradeEmojis.includes(grade)) {
      return grade;
    }
    return gradeToEmoji[grade] || '🍒';
  };

  const getGradeName = (emoji: string) => {
    return emojiToGrade[emoji] || '체리';
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
    setLoading(true);
    const unsubscribe = onSnapshot(doc(db, 'posts', id), async (docSnapshot) => {
      if (!docSnapshot.exists() || docSnapshot.data().type !== 'partner') {
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
      setApplicants(data.applicants || []);
      setIsClosed(data.isClosed || false);
      setClosedAt(data.closedAt || null);
      setLoading(false);
      if (!data.isClosed && data.createdAt && Date.now() - data.createdAt.toDate().getTime() > 10 * 24 * 60 * 60 * 1000) {
        await updateDoc(doc(db, 'posts', id), { isClosed: true, closedAt: serverTimestamp() });
        setIsClosed(true);
      }
    }, (error) => {
      setLoading(false);
      setPost(null);
    });
    return () => unsubscribe();
  }, [id, navigate]);

  useEffect(() => {
    if (!user || !post || !applicants.length || user.uid !== post.writerUid) return;
    Promise.all(applicants.map(async (uid) => {
      const userDoc = await getDoc(doc(db, 'users', uid));
      return userDoc.exists() ? { uid, ...userDoc.data() } : null;
    })).then(setApplicantUsers);
  }, [user, post, applicants]);

  const formatDate = (date: Date | any) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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

  const handleApply = async () => {
    if (!user || !post) return;
    if (isClosed) return;
    const hasApplied = applicants.includes(user.uid);
    if (!hasApplied) {
      if (!window.confirm('지원하시겠습니까?')) return;
      await updateDoc(doc(db, 'posts', post.id), {
        applicants: arrayUnion(user.uid)
      });
      setApplicants(prev => [...prev, user.uid]);
    } else {
      if (!window.confirm('지원을 취소하겠습니까?')) return;
      await updateDoc(doc(db, 'posts', post.id), {
        applicants: arrayRemove(user.uid)
      });
      setApplicants(prev => prev.filter(uid => uid !== user.uid));
    }
  };

  const handleClose = async () => {
    if (!post) return;
    await updateDoc(doc(db, 'posts', post.id), {
      isClosed: true,
      closedAt: serverTimestamp()
    });
    setIsClosed(true);
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

  return (
    <div className="post-detail-container">
      <div className="post-navigation">
        <button className="back-button" onClick={() => navigate('/boards/partner')}>
          <ArrowLeft size={20} />
          목록으로
        </button>
      </div>
      <article className="post-detail">
        <div className="post-detail-header" style={{ width: '100%', maxWidth: '100%', marginLeft: 0, paddingLeft: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: '2rem' }}>
          <div className="title-container" style={{ width: '100%', maxWidth: '100%', marginLeft: 0, paddingLeft: 0, display: 'flex', alignItems: 'center', gap: '1.5rem', justifyContent: 'flex-start' }}>
            {post.category && <span className="category-tag">{categoryNameMap[post.category] || '기타'}</span>}
            <h1 className="post-detail-title" style={{ textAlign: 'left', flex: 1, maxWidth: '100%' }}>{post.title}</h1>
            <div className="post-detail-author" style={{display:'flex',alignItems:'center',gap:'0.7rem',marginLeft:'auto'}}>
              <User size={20} />
              <span className="author-info">
                {post.writerNickname}
                <span className="author-grade-emoji" title={getGradeName(post.writerGrade || '🍒')}>
                  {getGradeEmoji(post.writerGrade || '🍒')}
                </span>
              </span>
              {post.writerRole && post.writerRole !== '일반' && (
                <span className="author-role">{post.writerRole}</span>
              )}
              {post.writerPosition && (
                <span className="author-position">{post.writerPosition}</span>
              )}
              <button className="message-btn" style={{ background: '#F6F2FF', border: 'none', borderRadius: 8, padding: '6px 14px', color: '#8A55CC', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowMessageModal(true)}>
                <MessageSquare size={18} /> 쪽지
              </button>
            </div>
          </div>
          <div className="post-detail-info" style={{marginTop:'0.7rem'}}>
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
        <div className="post-detail-content">
          {post.content.split('\n').map((line, index) => (
            <p key={index}>{line}</p>
          ))}
          {isClosed && (
            <div style={{marginTop:'1.5rem',padding:'1rem',background:'#F6F2FF',color:'#8A55CC',fontWeight:600,borderRadius:8,fontSize:'1.05rem',textAlign:'center'}}>
              (해당 게시글은 모집이 완료된 게시글입니다)
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
            {/* 모집완료/지원자보기 버튼: 작성자만, 모집중일 때만 노출 */}
            {user && post.writerUid === user.uid && !isClosed && (
              <>
                <button 
                  className="close-btn" 
                  style={{marginLeft:24, background:'#8A55CC', color:'#fff', fontWeight:700, fontSize:'1.05rem', borderRadius:8, padding:'0.7rem 1.5rem', border:'none', boxShadow:'0 2px 8px rgba(124,58,237,0.12)', cursor:'pointer'}}
                  onClick={() => {
                    if(window.confirm('정말 모집완료 하겠습니까?')) handleClose();
                  }}
                >
                  파트너 모집완료
                </button>
                <button
                  className="applicants-btn"
                  style={{marginLeft:12, background:'#fff', color:'#8A55CC', fontWeight:700, fontSize:'1.05rem', borderRadius:8, padding:'0.7rem 1.5rem', border:'2px solid #8A55CC', boxShadow:'0 2px 8px rgba(124,58,237,0.08)', cursor:'pointer'}}
                  onClick={() => setShowApplicantsModal(true)}
                >
                  지원자보기
                </button>
              </>
            )}
            {user && post.writerUid === user.uid && isClosed && (
              <span className="closed-badge" style={{marginLeft:24, color:'#8A55CC', fontWeight:600}}>모집완료</span>
            )}
            {/* 작성자가 아닌 사용자: 지원하기/지원완료 버튼 */}
            {!isClosed && user && post.writerUid !== user.uid && (
              <button 
                className="apply-btn"
                style={{marginLeft:24, background: applicants.includes(user.uid) ? '#eee' : '#fff', color: applicants.includes(user.uid) ? '#aaa' : '#8A55CC', fontWeight:700, fontSize:'1.05rem', borderRadius:8, padding:'0.7rem 1.5rem', border: applicants.includes(user.uid) ? '2px solid #ccc' : '2px solid #8A55CC', cursor: applicants.includes(user.uid) ? 'pointer' : 'pointer'}}
                onClick={handleApply}
              >
                {applicants.includes(user.uid) ? '지원 완료 (취소)' : '지원하기'}
              </button>
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
        </div>
      </article>
      <CommentSection postId={post.id} user={user} post={{ id: post.id, title: post.title, writerUid: post.writerUid, writerNickname: post.writerNickname }} />
      {/* 지원자 모달 */}
      {showApplicantsModal && (
        <div className="modal-overlay" style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.25)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div className="modal-content" style={{background:'#fff',borderRadius:12,padding:'2rem',minWidth:320,maxWidth:400,boxShadow:'0 4px 24px rgba(0,0,0,0.12)',position:'relative'}}>
            <button style={{position:'absolute',top:12,right:12,background:'none',border:'none',fontSize:20,cursor:'pointer'}} onClick={()=>setShowApplicantsModal(false)}><X size={24}/></button>
            <h3 style={{marginBottom:16,fontWeight:700,fontSize:'1.15rem'}}>지원자 목록</h3>
            {applicantUsers.length === 0 ? (
              <p style={{color:'#888'}}>아직 지원자가 없습니다.</p>
            ) : (
              <ul style={{padding:0,listStyle:'none'}}>
                {applicantUsers.map(u => (
                  <li key={u.uid} style={{marginBottom:8}}>
                    {u.nickname || u.email} {u.grade && <span style={{marginLeft:4}}>{u.grade}</span>}
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