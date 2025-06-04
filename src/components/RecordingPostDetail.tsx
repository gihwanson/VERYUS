import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  ArrowLeft,
  Heart,
  MessageCircle,
  Play,
  Pause,
  MoreVertical,
  Edit,
  Trash,
  Send,
  Eye,
  User,
  Clock,
  AlertTriangle,
  Loader,
  MessageSquare
} from 'lucide-react';
import './Board.css';
import CommentSection from './CommentSection';

interface User {
  uid: string;
  email: string;
  nickname: string;
  role?: string;
  grade?: string;
  position?: string;
  isLoggedIn: boolean;
}

interface Comment {
  id: string;
  content: string;
  writerUid: string;
  writerNickname: string;
  createdAt: any;
}

interface RecordingPost {
  id: string;
  title: string;
  description: string;
  writerUid: string;
  writerNickname: string;
  createdAt: any;
  audioUrl: string;
  duration: number;
  likesCount: number;
  commentCount: number;
  views: number;
  likes: string[];
  writerGrade?: string;
  writerPosition?: string;
  writerRole?: string;
  fileName?: string;
}

const gradeEmojis = ['🍒', '🫐', '🥝', '🍎', '🍈', '🍉', '🌍', '🪐', '☀️', '🌌', '🍺', '⚡', '⭐', '🌙'];
const gradeToEmoji: { [key: string]: string } = {
  '체리': '🍒', '블루베리': '🫐', '키위': '🥝', '사과': '🍎', '멜론': '🍈', '수박': '🍉', '지구': '🌍', '토성': '🪐', '태양': '☀️', '은하': '🌌', '맥주': '🍺', '번개': '⚡', '별': '⭐', '달': '🌙'
};
const emojiToGrade: { [key: string]: string } = {
  '🍒': '체리', '🫐': '블루베리', '🥝': '키위', '🍎': '사과', '🍈': '멜론', '🍉': '수박', '🌍': '지구', '🪐': '토성', '☀️': '태양', '🌌': '은하', '🍺': '맥주', '⚡': '번개', '⭐': '별', '🌙': '달'
};
const getGradeEmoji = (grade: string) => gradeEmojis.includes(grade) ? grade : gradeToEmoji[grade] || '🍒';
const getGradeName = (emoji: string) => emojiToGrade[emoji] || '체리';

const RecordingPostDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [post, setPost] = useState<RecordingPost | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageContent, setMessageContent] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      setUser(JSON.parse(userString));
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const unsubscribe = onSnapshot(doc(db, 'posts', id), (docSnapshot) => {
      if (!docSnapshot.exists()) {
        setError('게시글을 찾을 수 없습니다.');
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
          // writerGrade는 여기서 set하지 않음
        } as RecordingPost;
      });
      setLoading(false);
    }, (error) => {
      setError('게시글을 불러오는 중 오류가 발생했습니다.');
      setLoading(false);
    });
    return () => unsubscribe();
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const commentsQuery = query(
      collection(db, 'comments'),
      where('postId', '==', id),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
      const newComments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Comment[];
      setComments(newComments);
    }, (error) => {
      console.error('댓글 로딩 오류:', error);
      setError('댓글을 불러오는 중 오류가 발생했습니다.');
    });

    return () => unsubscribe();
  }, [id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePlayPause = () => {
    if (!audioRef.current || !post?.audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

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

  const handleCommentSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !post || !newComment.trim()) return;

    try {
      const commentData = {
        postId: post.id,
        content: newComment.trim(),
        writerUid: user.uid,
        writerNickname: user.nickname,
        createdAt: serverTimestamp()
      };

      const commentRef = await addDoc(collection(db, 'comments'), commentData);
      
      // 게시글의 댓글 수 업데이트
      await updateDoc(doc(db, 'posts', post.id), {
        commentCount: increment(1)
      });

      setNewComment('');
    } catch (error) {
      console.error('댓글 작성 오류:', error);
      alert('댓글 작성 중 오류가 발생했습니다.');
    }
  }, [user, post, newComment]);

  const handleDelete = async () => {
    if (!post || !user || (user.uid !== post.writerUid && user.role !== '리더' && user.role !== '운영진')) {
      alert('삭제 권한이 없습니다.');
      return;
    }

    if (!window.confirm('정말 이 게시글을 삭제하시겠습니까?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'posts', post.id));
      alert('게시글이 삭제되었습니다.');
      navigate('/recording');
    } catch (error) {
      console.error('게시글 삭제 오류:', error);
      alert('게시글 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleEdit = () => {
    if (!post || !user || user.uid !== post.writerUid) {
      alert('수정 권한이 없습니다.');
      return;
    }
    navigate(`/recording/edit/${post.id}`);
  };

  const formatDate = (date: any) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (post?.audioUrl) {
      audioRef.current = new Audio(post.audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [post?.audioUrl]);

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
  }, [post?.audioUrl]);

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    if (audioRef.current && audioDuration) {
      audioRef.current.currentTime = percent * audioDuration;
      setCurrentTime(percent * audioDuration);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className="post-detail-container">
        <div className="post-navigation">
          <button className="back-button" onClick={() => navigate('/recording')}>
            <ArrowLeft size={20} />
            목록으로
          </button>
        </div>
        <div className="error-container">
          <AlertTriangle size={48} />
          <h3>{error}</h3>
          <button className="back-button" onClick={() => navigate('/recording')}>목록으로 돌아가기</button>
        </div>
      </div>
    );
  }

  if (loading || !post) {
    return (
      <div className="post-detail-container">
        <div className="post-navigation">
          <button className="back-button" onClick={() => navigate('/recording')}>
            <ArrowLeft size={20} />
            목록으로
          </button>
        </div>
        <div className="loading-container">
          <Loader className="loading-spinner" />
          게시글을 불러오는 중...
        </div>
      </div>
    );
  }

  return (
    <div className="post-detail-container">
      <div className="post-navigation">
        <button className="back-button" onClick={() => navigate('/recording')}>
          <ArrowLeft size={20} />
          목록으로
        </button>
      </div>
      <article className="post-detail">
        <div className="post-detail-header" style={{ width: '100%', maxWidth: '100%', marginLeft: 0, paddingLeft: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: '2rem' }}>
          <div className="title-container" style={{ width: '100%', maxWidth: '100%', marginLeft: 0, paddingLeft: 0, display: 'flex', flexDirection: window.innerWidth <= 768 ? 'column' : 'row', alignItems: window.innerWidth <= 768 ? 'flex-start' : 'center', gap: window.innerWidth <= 768 ? '0.2rem' : '1.5rem', justifyContent: 'flex-start' }}>
            <span className="category-tag">녹음</span>
            <h1 className="post-detail-title" style={{ textAlign: 'left', flex: 1, fontWeight: 800, fontSize: window.innerWidth <= 768 ? '1.5rem' : '1.25rem', marginBottom: window.innerWidth <= 768 ? '0.1rem' : 0 }}>
              {post.title}
            </h1>
          </div>
          {window.innerWidth <= 768 ? (
            <>
              <div className="post-detail-author" style={{display:'flex',alignItems:'center',gap:'0.4rem',margin:'0 0 0.05rem 0',padding:0}}>
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
              <div className="post-detail-info" style={{margin:'0 0 0.05rem 0',padding:0}}>
                <span className="post-detail-date">
                  <Clock size={16} />
                  {formatDate(post.createdAt)}
                </span>
                <span className="post-detail-views">
                  <Eye size={16} />
                  조회 {post.views || 0}
                </span>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
        <div className="post-detail-content">
          {/* 업로드된 파일명 표시 */}
          {post.fileName && (
            <div style={{
              background: '#F6F2FF', color: '#8A55CC', borderRadius: '12px', padding: '8px 20px', margin: '0 auto 18px auto', maxWidth: 340, minWidth: 180, textAlign: 'center', fontWeight: 600, fontSize: '1rem'
            }}>
              파일명: {post.fileName}
            </div>
          )}
          <div className="audio-player">
            <button onClick={handlePlayPause} className="audio-play-btn">
              {isPlaying ? <Pause size={32} /> : <Play size={32} />}
            </button>
            <div style={{ flex: 1, margin: '0 16px', display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#8A55CC', minWidth: 38 }}>{formatTime(currentTime)}</span>
              <div
                className="audio-progress-bar"
                style={{ flex: 1, height: 8, background: '#E5DAF5', borderRadius: 4, margin: '0 8px', cursor: 'pointer', position: 'relative' }}
                onClick={handleProgressBarClick}
              >
                <div
                  style={{
                    width: audioDuration ? `${(currentTime / audioDuration) * 100}%` : '0%',
                    height: '100%',
                    background: 'linear-gradient(90deg, #8A55CC 60%, #B497D6 100%)',
                    borderRadius: 4,
                    transition: 'width 0.1s',
                  }}
                />
              </div>
              <span style={{ fontSize: 13, color: '#8A55CC', minWidth: 38 }}>{formatTime(audioDuration || post.duration)}</span>
            </div>
            <audio ref={audioRef} src={post.audioUrl} preload="auto" />
          </div>
          <div className="recording-description">{post.description}</div>
        </div>
        <div className="post-detail-footer">
          <div className="post-stats">
            <button 
              onClick={handleLike}
              className={`stat-button ${user && post.likes.includes(user.uid) ? 'liked' : ''}`}
              disabled={!user}
              title={user ? '좋아요' : '로그인이 필요합니다'}
            >
              <Heart 
                size={20} 
                fill={user && post.likes.includes(user.uid) ? 'currentColor' : 'none'} 
              />
              <span>{post.likesCount || 0}</span>
            </button>
            <a
              href={post.audioUrl}
              download={post.fileName || 'recording.mp3'}
              className="stat-button"
              style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4, color: '#8A55CC', textDecoration: 'none', fontWeight: 600 }}
              title="다운로드"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span style={{ fontSize: 15 }}>다운로드</span>
            </a>
          </div>
          <div className="post-actions">
            {user && user.uid === post.writerUid && (
              <button onClick={handleEdit} className="action-button">
                <Edit size={20} />
                수정
              </button>
            )}
            {user && (user.uid === post.writerUid || user.role === '운영진' || user.role === '리더') && (
              <button onClick={handleDelete} className="action-button">
                <Trash size={20} />
                삭제
              </button>
            )}
          </div>
        </div>
      </article>
      {/* 댓글 영역 */}
      {post && <CommentSection postId={post.id} user={user} post={{ id: post.id, title: post.title, writerUid: post.writerUid, writerNickname: post.writerNickname }} />}
      {/* 쪽지 모달 */}
      {showMessageModal && (
        <div className="modal-overlay" onClick={() => setShowMessageModal(false)}>
          <div className="message-modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 360, margin: '120px auto', boxShadow: '0 8px 32px #E5DAF5' }}>
            <h3 style={{ color: '#8A55CC', fontWeight: 700, marginBottom: 16 }}>{post.writerNickname}님에게 쪽지 보내기</h3>
            <textarea
              value={messageContent}
              onChange={e => setMessageContent(e.target.value)}
              placeholder="쪽지 내용을 입력하세요..."
              style={{ width: '100%', minHeight: 80, borderRadius: 8, border: '1px solid #E5DAF5', padding: 12, marginBottom: 16 }}
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
    </div>
  );
};

export default RecordingPostDetail; 