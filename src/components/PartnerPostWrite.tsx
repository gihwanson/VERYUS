import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  collection, 
  addDoc, 
  doc, 
  getDoc, 
  updateDoc, 
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  ArrowLeft, 
  UserPlus, 
  PenTool, 
  Eye, 
  Save,
  Loader,
  X
} from 'lucide-react';
import '../styles/PostWrite.css';
import '../styles/BoardLayout.css';

interface User {
  uid: string;
  email: string;
  nickname?: string;
  isLoggedIn: boolean;
  grade: string;
}

interface DraftPost {
  title: string;
  content: string;
  category: string;
  lastSaved: Date;
}

const categories = [
  { id: 'vocal', name: '보컬', icon: '🎤' },
  { id: 'etc', name: '세션', icon: '🎹' },
  { id: 'etc2', name: '기타', icon: '❓' }
];

const AUTO_SAVE_INTERVAL = 30000; // 30초

// 세션 카테고리 등급 제한을 위한 등급 배열
const sessionAllowedGrades = ['지구', '토성', '태양', '은하', '번개', '🌍', '🪐', '☀️', '🌌', '⚡'];

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
      (async () => {
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
          updatedAt: serverTimestamp(),
        });
        alert('게시글이 수정되었습니다.');
        navigate(`/boards/partner/${id}`);
      } else {
        const postRef = collection(db, 'posts');
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
          likes: [],
        };
        await addDoc(postRef, newPost);
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
    <div className="write-page">
      <div className="write-form">
        <div className="write-form-header">
          <UserPlus size={24} />
          <h1 className="write-form-title">{isEditMode ? '파트너모집 글 수정' : '파트너모집 새 글 작성'}</h1>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">카테고리</label>
            <div className="category-selector">
              {categories.map(cat => {
                let disabled = false;
                if (cat.id === 'etc') {
                  const userGrade = user?.grade || '';
                  disabled = !sessionAllowedGrades.includes(userGrade);
                }
                const handleCategoryClick = () => {
                  if (disabled) {
                    alert('지구등급 이상만 선택할 수 있습니다');
                    return;
                  }
                  setCategory(cat.id);
                };
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`category-button ${category === cat.id ? 'active' : ''}`}
                    onClick={handleCategoryClick}
                    disabled={false}
                  >
                    <span className="category-icon">{cat.icon}</span>
                    {cat.name}
                    {cat.id === 'etc' && disabled && (
                      <span style={{ color: 'red', fontSize: 12, marginLeft: 4 }}>(지구 등급 이상만)</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
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
              onClick={() => navigate(isEditMode && id ? `/boards/partner/${id}` : '/boards/partner')}
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
                '저장'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PartnerPostWrite; 