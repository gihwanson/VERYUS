import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase';
import { NotificationService } from '../utils/notificationService';
import { ArrowLeft, PenTool, Save, Loader, X } from 'lucide-react';
import '../styles/PostWrite.css';
import '../styles/BoardLayout.css';
import '../styles/FreePostWrite.css';

interface User {
  uid: string;
  email: string;
  nickname?: string;
  isLoggedIn: boolean;
}

const categories = [
  { id: 'general', name: '일반', icon: '💬' },
  { id: 'question', name: '질문', icon: '❓' },
  { id: 'share', name: '정보공유', icon: '📢' },
  { id: 'discussion', name: '토론', icon: '💭' },
  { id: 'request', name: '신청곡', icon: '🎵' }
];

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

  useEffect(() => {
    if (id) {
      setIsEditMode(true);
      void (async () => {
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

  const handleBack = () => {
    navigate(isEditMode && id ? `/free/${id}` : '/free');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    const hasRequestTarget = requestTargets.some((target) => target.trim());
    if (!title.trim() || !content.trim() || (category === 'request' && !hasRequestTarget)) {
      alert('제목, 내용을 모두 입력해주시고, 신청곡은 대상도 입력해주세요.');
      return;
    }
    let finalContent = content;
    if (category === 'request' && hasRequestTarget) {
      const targetsText = requestTargets.map((t) => t.trim()).filter(Boolean).join(', ');
      finalContent = `신청 대상: ${targetsText}\n` + content;
    }
    try {
      setIsSubmitting(true);
      if (isEditMode && id) {
        await updateDoc(doc(db, 'posts', id), {
          title,
          content: finalContent,
          category,
          updatedAt: serverTimestamp()
        });
        alert('게시글이 수정되었습니다.');
        navigate(`/free/${id}`);
      } else {
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
          likes: []
        };
        const createdPostRef = await addDoc(postRef, newPost);

        if (category === 'request' && requestTargets.some((target) => target.trim())) {
          try {
            const rawTargets = requestTargets.map((target) => target.trim()).filter(Boolean);
            const uniqueTargets = Array.from(new Set(rawTargets));

            await Promise.all(
              uniqueTargets.map(async (targetNickname) => {
                const q = query(collection(db, 'users'), where('nickname', '==', targetNickname));
                const snapshot = await getDocs(q);
                if (snapshot.empty) return;

                await Promise.all(
                  snapshot.docs.map(async (targetUserDoc) => {
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
                  })
                );
              })
            );
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
    <div className="board-container free-post-write-page">
      <div className="free-post-write">
        <header className="free-post-write__top">
          <button type="button" className="free-post-write__back" onClick={handleBack}>
            <ArrowLeft size={20} strokeWidth={2.25} aria-hidden />
            {isEditMode ? '글로 돌아가기' : '목록으로'}
          </button>
          <div className="free-post-write__title-wrap">
            <PenTool className="free-post-write__title-icon" size={26} strokeWidth={2} aria-hidden />
            <div>
              <h1 className="free-post-write__title">{isEditMode ? '게시글 수정' : '새 글 작성'}</h1>
              <p className="free-post-write__subtitle">
                {isEditMode
                  ? '내용을 고친 뒤 저장하면 게시글이 바로 반영됩니다.'
                  : '카테고리를 고른 뒤 제목과 본문을 작성해 주세요. 신청곡은 대상 닉네임에게 알림이 갑니다.'}
              </p>
            </div>
          </div>
        </header>

        <main className="write-form free-post-write__form">
          <form onSubmit={handleSubmit}>
            <section className="free-post-write__section" aria-labelledby="free-cat-label">
              <span id="free-cat-label" className="free-post-write__section-label">
                카테고리
              </span>
              <div className="free-post-write__category-grid" role="listbox" aria-label="게시글 카테고리">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    role="option"
                    aria-selected={category === cat.id}
                    className={`free-post-write__category-btn${category === cat.id ? ' free-post-write__category-btn--active' : ''}`}
                    onClick={() => setCategory(cat.id)}
                  >
                    <span className="free-post-write__category-emoji" aria-hidden>
                      {cat.icon}
                    </span>
                    {cat.name}
                  </button>
                ))}
              </div>
            </section>

            {category === 'request' && (
              <section className="free-post-write__section" aria-labelledby="free-request-label">
                <span id="free-request-label" className="free-post-write__section-label">
                  신청 대상
                </span>
                <p className="free-post-write__hint">
                  <strong>정확한 닉네임</strong>을 적어 주세요. 저장 시 해당 회원에게 알림이 전송됩니다.
                </p>
                {requestTargets.map((target, idx) => (
                  <div key={idx} className="free-post-write__target-row">
                    <input
                      type="text"
                      className="title-input free-post-write__target-input"
                      placeholder="누구에게 신청할까요?"
                      value={target}
                      onChange={(e) =>
                        setRequestTargets((prev) => prev.map((t, i) => (i === idx ? e.target.value : t)))
                      }
                      maxLength={50}
                      autoComplete="off"
                    />
                    {requestTargets.length > 1 && (
                      <button
                        type="button"
                        className="free-post-write__mini-btn free-post-write__mini-btn--remove"
                        onClick={() => setRequestTargets((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        삭제
                      </button>
                    )}
                    {idx === requestTargets.length - 1 && (
                      <button
                        type="button"
                        className="free-post-write__mini-btn free-post-write__mini-btn--add"
                        onClick={() => setRequestTargets((prev) => [...prev, ''])}
                      >
                        추가
                      </button>
                    )}
                  </div>
                ))}
              </section>
            )}

            <section className="free-post-write__section">
              <label htmlFor="free-post-title" className="free-post-write__section-label">
                제목
              </label>
              <input
                id="free-post-title"
                type="text"
                className="title-input free-post-write__title-input"
                placeholder="제목을 입력하세요"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                autoComplete="off"
              />
            </section>

            <section className="free-post-write__section">
              <label htmlFor="free-post-content" className="free-post-write__section-label">
                내용
              </label>
              <textarea
                id="free-post-content"
                className="content-textarea free-post-write__textarea"
                placeholder="내용을 입력하세요 (Shift+Enter로 줄바꿈)"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(Math.max(target.scrollHeight, 150), 500) + 'px';
                }}
              />
            </section>

            <div className="free-post-write__actions">
              <button type="submit" className="submit-button free-post-write__submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader className="loading-spinner" size={18} aria-hidden />
                    저장 중…
                  </>
                ) : (
                  <>
                    <Save size={18} aria-hidden />
                    {isEditMode ? '수정 완료' : '등록하기'}
                  </>
                )}
              </button>
              <button type="button" className="cancel-button free-post-write__cancel" onClick={handleBack} disabled={isSubmitting}>
                <X size={18} aria-hidden />
                취소
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
};

export default FreePostWrite;
