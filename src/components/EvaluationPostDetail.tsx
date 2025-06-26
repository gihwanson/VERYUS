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
import '../styles/PostDetail.css';
import '../styles/BoardLayout.css';
import CommentSection from './CommentSection';
import { useAudioPlayer } from '../App';
import { NotificationService } from '../utils/notificationService';

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
  duration?: number;
  members?: string[];
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

const EvaluationPostDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [post, setPost] = useState<EvaluationPost | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageContent, setMessageContent] = useState('');
  const { isPlaying: isGlobalPlaying, pause: pauseGlobal, play: playGlobal, currentIdx: globalIdx } = useAudioPlayer();
  const location = useLocation();
  // 글로벌 플레이리스트 상태 기억용
  const globalStateRef = React.useRef<{idx: number, wasPlaying: boolean}>({idx: 0, wasPlaying: false});

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
    if (userString) {
      setUser(JSON.parse(userString));
    }
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
      setPost(prev => {
        return {
          ...(prev || {}),
          ...data,
          id: docSnapshot.id,
          likes: Array.isArray(data.likes) ? data.likes : [],
        } as EvaluationPost;
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
      navigate('/evaluation');
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
    navigate(`/evaluation/edit/${post.id}`);
  };

  if (error) {
    return (
      <div className="error-container">
        <p>{error}</p>
        <button onClick={() => navigate('/evaluation')}>목록으로 돌아가기</button>
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
        <div className="post-navigation">
          <button className="back-button" onClick={() => navigate('/evaluation')}>
            <ArrowLeft size={20} />
            목록으로
          </button>
        </div>
      <article className="post-detail">
        <div className="post-detail-header">
          <div className="title-container">
            <div className="title-section">
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
                <span className={`role-badge ${post.writerRole || '일반'}`}>
                  {post.writerRole || '일반'}
                </span>
                {post.writerPosition && (
                  <span className="author-position">{post.writerPosition}</span>
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
            <div style={{marginBottom: 12, color: '#8A55CC', fontWeight: 700, fontSize: '1.08rem', background:'#F6F2FF', borderRadius:12, padding:'10px 18px', textAlign:'center'}}>
              해당 곡은 합격처리 되었습니다
            </div>
          )}
          {(!post.status || post.status === '대기') && (
            post.category === 'feedback' ? (
              <div style={{marginBottom: 12, color: '#8A55CC', fontWeight: 700, fontSize: '1.08rem', background:'#F6F2FF', borderRadius:12, padding:'10px 18px', textAlign:'center'}}>
                피드백을 남겨주세요!
              </div>
            ) : (
              <div style={{marginBottom: 12, color: '#888', fontWeight: 600, fontSize: '1.05rem', background:'#F3F4F6', borderRadius:12, padding:'10px 18px', textAlign:'center'}}>
                아직 대기중 입니다
              </div>
            )
          )}
          {/* 함께한 멤버 노출 */}
          {Array.isArray(post.members) && post.members.length > 0 && (
            <div style={{marginBottom: 10, color: '#8A55CC', fontWeight: 600, fontSize: '1.04rem', background:'#F6F2FF', borderRadius:12, padding:'8px 16px', textAlign:'center'}}>
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
            {post.fileName && (
              <div style={{
                background: '#F6F2FF', color: '#8A55CC', borderRadius: '12px', padding: '8px 20px', margin: '0 auto 18px auto', maxWidth: 340, minWidth: 180, textAlign: 'center', fontWeight: 600, fontSize: '1rem'
              }}>
                파일명: {post.fileName}
              </div>
            )}
            <AudioPlayer audioUrl={post.audioUrl} duration={post.duration} />
            <a
              href={post.audioUrl}
              download={post.fileName || 'evaluation.mp3'}
              className="stat-button"
              style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4, color: '#8A55CC', textDecoration: 'none', fontWeight: 600 }}
              title="다운로드"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span style={{ fontSize: 15 }}>다운로드</span>
            </a>
            {/* 합불 판정 버튼 (오디오 밑, 가운데 정렬) */}
            {user && user.role === '리더' && post.category === 'busking' && post.status !== '합격' && post.status !== '불합격' && (
              <div style={{margin:'18px 0 0 0', display:'flex', justifyContent:'center', gap:16}}>
                <button onClick={async()=>{
                  if (!window.confirm('정말 합격 처리하시겠습니까?')) return;
                  
                  try {
                    // 게시글 상태 업데이트
                    await updateDoc(doc(db, 'posts', post.id), { status: '합격' });
                    setPost(p=>p ? { ...p, status: '합격' } : p);
                    
                    // 합격곡 자동 등록 (중복 체크 없이 무조건 등록)
                    const members = Array.isArray(post.members) ? post.members.filter(Boolean) : [];
                    const allMembers = [...members, post.writerNickname].filter((v, i, arr) => !!v && arr.indexOf(v) === i);
                    await addDoc(collection(db, 'approvedSongs'), {
                      title: post.title,
                      titleNoSpace: post.title.replace(/\s/g, ''),
                      members: allMembers,
                      createdAt: new Date(),
                      createdBy: user.nickname,
                      createdByRole: user.role || '',
                    });

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
                }} style={{background:'#8A55CC',color:'#fff',fontWeight:700,padding:'8px 22px',borderRadius:8,border:'none',fontSize:16,cursor:'pointer'}}>합격</button>
                
                <button onClick={async()=>{
                  if (!window.confirm('정말 불합격 처리하시겠습니까?')) return;
                  
                  try {
                    // 게시글 상태 업데이트
                    await updateDoc(doc(db, 'posts', post.id), { status: '불합격' });
                    setPost(p=>p ? { ...p, status: '불합격' } : p);

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
          
          <div className="post-actions">
            <button 
              onClick={handleEdit} 
              className="action-button"
            >
              <Edit size={20} />
              수정
            </button>
          </div>
        </div>
      </article>

      {/* 댓글 영역 */}
      {post && (
        <CommentSection
          postId={post.id}
          user={user}
          post={post}
          {...(post.category === 'feedback'
            ? {}
            : {
                noCommentAuthMessage: '해당 게시판은 리더와, 부운영진만 댓글을 달 수 있습니다',
                emptyCommentMessageVisibleToRoles: ['리더', '부운영진'],
              })}
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

  // 라우트 변경 시 오디오 일시정지
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    // eslint-disable-next-line
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
      setIsPlaying(false);
    } else {
      audioRef.current.play();
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
        <span style={{ fontSize: 13, color: '#8A55CC', minWidth: 38 }}>{formatTime(currentTime)}</span>
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
              background: 'linear-gradient(90deg, #8A55CC 60%, #B497D6 100%)',
              borderRadius: 4,
              transition: 'width 0.1s',
            }}
          />
        </div>
        <span style={{ fontSize: 13, color: '#8A55CC', minWidth: 38 }}>{formatTime(audioDuration || duration || 0)}</span>
      </div>
      <audio ref={audioRef} src={audioUrl} preload="auto" />
    </div>
  );
}

export default EvaluationPostDetail; 