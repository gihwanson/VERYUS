import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, UserPlus, Save, Loader, X } from 'lucide-react';
import '../styles/PostWrite.css';
import '../styles/BoardLayout.css';
import '../styles/PartnerPostWrite.css';

interface User {
  uid: string;
  email: string;
  nickname?: string;
  isLoggedIn: boolean;
}

const categories = [
  { id: 'vocal', name: '보컬', icon: '🎤' },
  { id: 'etc', name: '세션', icon: '🎹' },
  { id: 'etc2', name: '기타', icon: '❓' }
];

const PartnerPostWrite: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('vocal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const [user] = useState<User | null>(() => {
    const userStr = localStorage.getItem('veryus_user');
    return userStr ? JSON.parse(userStr) : null;
  });
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    if (id) {
      setIsEditMode(true);
      void (async () => {
        const postDoc = await getDoc(doc(db, 'posts', id));
        if (postDoc.exists()) {
          const data = postDoc.data();
          setTitle(data.title || '');
          setContent(data.content || '');
          setCategory(data.category || 'vocal');
        } else {
          alert('게시글을 찾을 수 없습니다.');
          navigate('/boards/partner');
        }
      })();
    }
  }, [id, navigate]);

  const handleBack = () => {
    navigate(isEditMode && id ? `/boards/partner/${id}` : '/boards/partner');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    if (!title.trim() || !content.trim()) {
      alert('제목과 내용을 모두 입력해주세요.');
      return;
    }
    try {
      setIsSubmitting(true);
      if (isEditMode && id) {
        await updateDoc(doc(db, 'posts', id), {
          title,
          content,
          category,
          updatedAt: serverTimestamp()
        });
        alert('게시글이 수정되었습니다.');
        navigate(`/boards/partner/${id}`);
      } else {
        const newPost = {
          title,
          content,
          category,
          type: 'partner',
          writerUid: user.uid,
          writerNickname: user.nickname || '익명',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastBumpedAt: serverTimestamp(),
          views: 0,
          likesCount: 0,
          commentCount: 0,
          likes: []
        };
        await addDoc(collection(db, 'posts'), newPost);
        navigate('/boards/partner');
      }
    } catch (error) {
      console.error('게시글 작성/수정 중 오류:', error);
      alert('게시글 작성/수정 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="board-container partner-post-write-page">
      <div className="partner-post-write">
        <header className="partner-post-write__top">
          <button type="button" className="partner-post-write__back" onClick={handleBack}>
            <ArrowLeft size={20} strokeWidth={2.25} aria-hidden />
            {isEditMode ? '글로 돌아가기' : '목록으로'}
          </button>
          <div className="partner-post-write__title-wrap">
            <UserPlus className="partner-post-write__title-icon" size={26} strokeWidth={2} aria-hidden />
            <div>
              <h1 className="partner-post-write__title">
                {isEditMode ? '파트너모집 글 수정' : '파트너모집 새 글'}
              </h1>
              <p className="partner-post-write__subtitle">
                {isEditMode
                  ? '수정 후 저장하면 게시글이 바로 반영됩니다.'
                  : '모집 유형을 고른 뒤 제목과 내용을 작성해 주세요.'}
              </p>
            </div>
          </div>
        </header>

        <main className="write-form partner-post-write__form">
          <form onSubmit={handleSubmit}>
            <section className="partner-post-write__section" aria-labelledby="partner-cat-label">
              <span id="partner-cat-label" className="partner-post-write__section-label">
                모집 유형
              </span>
              <div className="partner-post-write__category-grid" role="listbox" aria-label="파트너 모집 유형">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    role="option"
                    aria-selected={category === cat.id}
                    className={`partner-post-write__category-btn${
                      category === cat.id ? ' partner-post-write__category-btn--active' : ''
                    }`}
                    onClick={() => setCategory(cat.id)}
                  >
                    <span className="partner-post-write__category-emoji" aria-hidden>
                      {cat.icon}
                    </span>
                    {cat.name}
                  </button>
                ))}
              </div>
            </section>

            <section className="partner-post-write__section">
              <label htmlFor="partner-post-title" className="partner-post-write__section-label">
                제목
              </label>
              <input
                id="partner-post-title"
                type="text"
                className="title-input partner-post-write__title-input"
                placeholder="제목을 입력하세요"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                autoComplete="off"
              />
            </section>

            <section className="partner-post-write__section">
              <label htmlFor="partner-post-content" className="partner-post-write__section-label">
                내용
              </label>
              <textarea
                id="partner-post-content"
                className="content-textarea partner-post-write__textarea"
                placeholder="모집 조건, 연락 방법 등을 적어 주세요. (Shift+Enter로 줄바꿈)"
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

            <div className="partner-post-write__actions">
              <button type="submit" className="submit-button partner-post-write__submit" disabled={isSubmitting}>
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
              <button type="button" className="cancel-button partner-post-write__cancel" onClick={handleBack} disabled={isSubmitting}>
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

export default PartnerPostWrite;
