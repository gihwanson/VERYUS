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
  PenTool, 
  Image as ImageIcon, 
  Eye, 
  Save,
  Loader,
  X,
  Hash
} from 'lucide-react';
import './Board.css';

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
  { id: 'discussion', name: '토론', icon: '💭' }
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

  // 수정 모드일 때 게시글 불러오기
  useEffect(() => {
    if (id) {
      setIsEditMode(true);
      (async () => {
        const postDoc = await getDoc(doc(db, 'posts', id));
        if (postDoc.exists()) {
          const data = postDoc.data();
          setTitle(data.title || '');
          setContent(data.content || '');
          setCategory(data.category || 'general');
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
    if (!title.trim() || !content.trim()) {
      alert('제목과 내용을 모두 입력해주세요.');
      return;
    }
    try {
      setIsSubmitting(true);
      if (isEditMode && id) {
        // 수정
        await updateDoc(doc(db, 'posts', id), {
          title,
          content,
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
          content,
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
        await addDoc(postRef, newPost);
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
    <div className="write-page">
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
              placeholder="내용을 입력하세요"
              value={content}
              onChange={(e) => setContent(e.target.value)}
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