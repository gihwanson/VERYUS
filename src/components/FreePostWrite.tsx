import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  collection, 
  addDoc, 
  doc, 
  getDoc, 
  updateDoc, 
  serverTimestamp,
  setDoc,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase';
import { NotificationService } from '../utils/notificationService';
import { 
  ArrowLeft, 
  PenTool, 
  Image as ImageIcon, 
  Eye, 
  Save,
  Loader,
  X,
  Hash
} from 'lucide-react';
import '../styles/PostWrite.css';
import '../styles/BoardLayout.css';

interface User {
  uid: string;
  email: string;
  nickname?: string;
  isLoggedIn: boolean;
}

interface DraftPost {
  title: string;
  content: string;
  category: string;
  lastSaved: Date;
}

const categories = [
  { id: 'general', name: '일반', icon: '💬' },
  { id: 'question', name: '질문', icon: '❓' },
  { id: 'share', name: '정보공유', icon: '📢' },
  { id: 'discussion', name: '토론', icon: '💭' },
  { id: 'request', name: '신청곡', icon: '🎵' },
];

const AUTO_SAVE_INTERVAL = 30000; // 30초

const FreePostWrite: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const [user] = useState<User | null>(() => {
    const userStr = localStorage.getItem('veryus_user');
    return userStr ? JSON.parse(userStr) : null;
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [requestTargets, setRequestTargets] = useState<string[]>(['']);

  // 컴포넌트 마운트 시 body 배경 설정
  useEffect(() => {
    console.log('🎨 FreePostWrite 컴포넌트가 마운트되었습니다!');
    const originalBodyBackground = document.body.style.background;
    const originalHtmlBackground = document.documentElement.style.background;
    const originalBodyMargin = document.body.style.margin;
    const originalBodyPadding = document.body.style.padding;
    
    // body와 html 모두에 배경 적용
    document.body.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    document.documentElement.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    document.body.style.minHeight = '100vh';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    console.log('🌈 배경이 설정되었습니다:', document.body.style.background);
    
    return () => {
      document.body.style.background = originalBodyBackground;
      document.documentElement.style.background = originalHtmlBackground;
      document.body.style.margin = originalBodyMargin;
      document.body.style.padding = originalBodyPadding;
      document.body.style.minHeight = '';
      console.log('🔄 배경이 복원되었습니다');
    };
  }, []);

  // 수정 모드일 때 게시글 불러오기
  useEffect(() => {
    if (id) {
      setIsEditMode(true);
      (async () => {
        const postDoc = await getDoc(doc(db, 'posts', id));
        if (postDoc.exists()) {
          const data = postDoc.data();
          const loadedTitle = data.title || '';
          const loadedContent = data.content || '';
          const loadedCategory = data.category || 'general';

          setTitle(loadedTitle);
          setCategory(loadedCategory);

          if (loadedCategory === 'request' && typeof loadedContent === 'string') {
            const lines = loadedContent.split('\n');
            const firstLine = lines[0] || '';
            if (firstLine.startsWith('신청 대상: ')) {
              const targetLine = firstLine.replace('신청 대상: ', '').trim();
              const targets = targetLine
                ? targetLine.split(',').map((t: string) => t.trim()).filter(Boolean)
                : [];
              setRequestTargets(targets.length > 0 ? targets : ['']);
              setContent(lines.slice(1).join('\n'));
            } else {
              setContent(loadedContent);
            }
          } else {
            setContent(loadedContent);
          }
        } else {
          alert('게시글을 찾을 수 없습니다.');
          navigate('/free');
        }
      })();
    }
  }, [id, navigate]);

  // 게시글 작성/수정 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    const hasRequestTarget = requestTargets.some(target => target.trim());
    if (!title.trim() || !content.trim() || (category === 'request' && !hasRequestTarget)) {
      alert('제목, 내용을 모두 입력해주시고, 신청곡은 대상도 입력해주세요.');
      return;
    }
    let finalContent = content;
    if (category === 'request' && hasRequestTarget) {
      const targetsText = requestTargets.map(t => t.trim()).filter(Boolean).join(', ');
      finalContent = `신청 대상: ${targetsText}\n` + content;
    }
    try {
      setIsSubmitting(true);
      if (isEditMode && id) {
        // 수정
        await updateDoc(doc(db, 'posts', id), {
          title,
          content: finalContent,
          category,
          updatedAt: serverTimestamp(),
        });
        alert('게시글이 수정되었습니다.');
        navigate(`/free/${id}`);
      } else {
        // 새 글 작성
        const postRef = collection(db, 'posts');
        const newPost = {
          title,
          content: finalContent,
          category,
          type: 'free',
          writerUid: user.uid,
          writerNickname: user.nickname || '익명',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          views: 0,
          likesCount: 0,
          commentCount: 0,
          likes: [],
        };
        const createdPostRef = await addDoc(postRef, newPost);

        // 신청곡 카테고리면 대상 멤버들에게 알림 전송
        if (category === 'request' && requestTargets.some(target => target.trim())) {
          try {
            const rawTargets = requestTargets.map(target => target.trim()).filter(Boolean);
            const uniqueTargets = Array.from(new Set(rawTargets));

            await Promise.all(uniqueTargets.map(async (targetNickname) => {
              const q = query(
                collection(db, 'users'),
                where('nickname', '==', targetNickname)
              );
              const snapshot = await getDocs(q);
              if (snapshot.empty) return;

              await Promise.all(snapshot.docs.map(async (targetUserDoc) => {
                const targetUid = targetUserDoc.id;
                if (targetUid === user.uid) return;

                await NotificationService.createNotification({
                  type: 'new_post',
                  toUid: targetUid,
                  fromNickname: user.nickname || '익명',
                  postId: createdPostRef.id,
                  postTitle: title,
                  postType: 'free',
                  message: `"${targetNickname}"님에게 신청곡 요청이 도착했습니다.`
                });
              }));
            }));
          } catch (notifyError) {
            console.error('신청곡 알림 전송 실패:', notifyError);
          }
        }
        navigate('/free');
      }
    } catch (error) {
      console.error('게시글 작성/수정 중 오류:', error);
      alert('게시글 작성/수정 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="write-page"
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        minHeight: '100vh',
        width: '100vw',
        position: 'relative',
        left: '50%',
        right: '50%',
        marginLeft: '-50vw',
        marginRight: '-50vw',
        padding: '2rem',
        boxSizing: 'border-box'
      }}
    >
      <div className="write-form">
        <div className="write-form-header">
          <PenTool size={24} />
          <h1 className="write-form-title">{isEditMode ? '게시글 수정' : '새 글 작성'}</h1>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">카테고리</label>
            <div className="category-selector">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  className={`category-button ${category === cat.id ? 'active' : ''}`}
                  onClick={() => setCategory(cat.id)}
                >
                  <span className="category-icon">{cat.icon}</span>
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {category === 'request' && (
            <div className="form-group" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, color: '#8A55CC', marginBottom: 6 }}>대상은?</div>
              {requestTargets.map((target, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input
                    type="text"
                    className="title-input"
                    placeholder="누구에게 신청하고 싶나요?"
                    value={target}
                    onChange={e => setRequestTargets(prev => prev.map((t, i) => i === idx ? e.target.value : t))}
                    maxLength={50}
                    style={{ flex: 1 }}
                  />
                  {requestTargets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRequestTargets(prev => prev.filter((_, i) => i !== idx))}
                      style={{ background: '#F43F5E', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 10px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      삭제
                    </button>
                  )}
                  {idx === requestTargets.length - 1 && (
                    <button
                      type="button"
                      onClick={() => setRequestTargets(prev => [...prev, ''])}
                      style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 10px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      + 추가
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="title" className="form-label">제목</label>
            <input
              id="title"
              type="text"
              className="title-input"
              placeholder="제목을 입력하세요"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="form-group">
            <label htmlFor="content" className="form-label">내용</label>
            <textarea
              id="content"
              className="content-textarea"
              placeholder="내용을 입력하세요 (Shift+Enter로 줄바꿈)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              style={{
                resize: 'none',
                overflow: 'hidden',
                minHeight: '150px',
                maxHeight: '500px',
                lineHeight: '1.4'
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(Math.max(target.scrollHeight, 150), 500) + 'px';
              }}
            />
          </div>

          <div className="form-footer">
            <button
              type="button"
              className="cancel-button"
              onClick={() => navigate(isEditMode && id ? `/free/${id}` : '/free')}
            >
              <X size={18} />
              취소
            </button>
            <button
              type="submit"
              className="submit-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader className="loading-spinner" size={18} />
                  저장 중...
                </>
              ) : (
                <>
                  <Save size={18} />
                  {isEditMode ? '수정완료' : '작성완료'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FreePostWrite; 