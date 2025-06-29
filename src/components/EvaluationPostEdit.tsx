import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, Save, Edit } from 'lucide-react';
import '../styles/PostWrite.css';
import '../styles/BoardLayout.css';

interface User {
  uid: string;
  email: string;
  nickname: string;
}

interface EvaluationPost {
  id: string;
  title: string;
  description: string;
  writerUid: string;
  writerNickname: string;
  createdAt: any;
}

const EvaluationPostEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [post, setPost] = useState<EvaluationPost | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (!userString) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    setUser(JSON.parse(userString));
  }, [navigate]);

  useEffect(() => {
    const fetchPost = async () => {
      if (!id) return;
      try {
        const postDoc = await getDoc(doc(db, 'posts', id));
        if (!postDoc.exists()) {
          setError('게시글을 찾을 수 없습니다.');
          setLoading(false);
          return;
        }
        const postData = {
          id: postDoc.id,
          ...postDoc.data()
        } as EvaluationPost;
        setPost(postData);
        setTitle(postData.title);
        setDescription(postData.description);
        setLoading(false);
      } catch (error) {
        console.error('게시글 로딩 오류:', error);
        setError('게시글을 불러오는 중 오류가 발생했습니다.');
        setLoading(false);
      }
    };
    fetchPost();
  }, [id]);

  const handleSubmit = async () => {
    if (!user || !post) return;
    if (!title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }
    try {
      setLoading(true);
      await updateDoc(doc(db, 'posts', post.id), {
        title,
        description
      });
      alert('게시글이 수정되었습니다.');
      navigate(`/evaluation/${post.id}`);
    } catch (error) {
      console.error('게시글 수정 오류:', error);
      alert('게시글 수정 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
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

  if (!user || user.uid !== post.writerUid) {
    return (
      <div className="error-container">
        <p>수정 권한이 없습니다.</p>
        <button onClick={() => navigate('/evaluation')}>목록으로 돌아가기</button>
      </div>
    );
  }

  return (
    <div className="board-container">
      <div className="board-header glassmorphism">
        <button className="back-button glassmorphism" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} /> 돌아가기
        </button>
        <h1 className="board-title">
          <Edit size={28} />
          평가글 수정
        </h1>
      </div>
      <div className="write-form">
        <div className="form-group">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목을 입력하세요"
            className="title-input"
          />
        </div>
        <div className="form-group">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="내용을 입력하세요 (Shift+Enter로 줄바꿈)"
            className="content-input"
            rows={6}
            style={{
              resize: 'none',
              overflow: 'hidden',
              minHeight: '150px',
              maxHeight: '400px',
              lineHeight: '1.4'
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(Math.max(target.scrollHeight, 150), 400) + 'px';
            }}
          />
        </div>
        <button className="submit-button" onClick={handleSubmit} disabled={loading}>
          <Save size={16} /> {loading ? '수정 중...' : '수정하기'}
        </button>
      </div>
    </div>
  );
};

export default EvaluationPostEdit; 