import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, Save, Edit } from 'lucide-react';
import '../styles/EvaluationPostWrite.css';
import { isEvaluationJudge } from '../utils/evaluationJudge';

interface User {
  uid: string;
  email: string;
  nickname: string;
  role?: string;
}

interface EvaluationPost {
  id: string;
  title: string;
  description: string;
  writerUid: string;
  writerNickname: string;
  createdAt: any;
  category?: string;
  members?: string[];
}

const EvaluationPostEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [post, setPost] = useState<EvaluationPost | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState<string[]>(['']);
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
        setDescription(postData.description || '');
        const initialMembers = Array.isArray(postData.members) && postData.members.length > 0
          ? postData.members
          : [''];
        setMembers(initialMembers);
        setLoading(false);
      } catch (error) {
        console.error('게시글 로딩 오류:', error);
        setError('게시글을 불러오는 중 오류가 발생했습니다.');
        setLoading(false);
      }
    };
    fetchPost();
  }, [id]);

  const isWriter = !!(user && post && user.uid === post.writerUid);
  const isJudge = isEvaluationJudge(user);
  const isJudgeOnlyEdit = isJudge && !isWriter;
  const requiresMembers = post?.category === 'busking' || post?.category === 'rejudge';

  const handleSubmit = async () => {
    if (!user || !post) return;
    if (!title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }
    if (requiresMembers && members.every((m) => !m.trim())) {
      alert('함께한 멤버를 최소 1명 이상 입력해주세요.');
      return;
    }
    try {
      setLoading(true);
      const updateData: { title: string; description?: string; members?: string[] } = {
        title: title.trim(),
      };
      if (requiresMembers) {
        updateData.members = members.map((m) => m.trim()).filter(Boolean);
      }
      if (isWriter) {
        updateData.description = description;
      }
      await updateDoc(doc(db, 'posts', post.id), updateData);
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

  if (!user || (!isWriter && !isJudge)) {
    return (
      <div className="error-container">
        <p>수정 권한이 없습니다.</p>
        <button onClick={() => navigate('/evaluation')}>목록으로 돌아가기</button>
      </div>
    );
  }

  return (
    <div className="board-container">
      <div className="board-header glassmorphism evaluation-post-edit-header">
        <button className="back-button glassmorphism" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} /> 돌아가기
        </button>
        <h1 className="board-title">
          <Edit size={28} />
          {isJudgeOnlyEdit ? '곡 정보 수정' : '평가글 수정'}
        </h1>
      </div>
      <div className="write-form">
        <div className="form-group">
          <label className="eval-post-write__section-label" htmlFor="eval-edit-title">
            곡 제목
          </label>
          <input
            id="eval-edit-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="곡 제목을 입력하세요"
            className="title-input"
          />
        </div>

        {requiresMembers && (
          <section className="eval-post-write__section" aria-labelledby="eval-edit-members-label">
            <span id="eval-edit-members-label" className="eval-post-write__section-label">
              함께한 멤버
            </span>
            <p className="eval-post-write__hint">
              듀엣·합창은 <strong>모든 멤버 닉네임</strong>을 적어 주세요. 솔로는 <strong>작성자 닉네임만</strong> 입력하면 됩니다.
            </p>
            {members.map((member, idx) => (
              <div key={idx} className="eval-post-write__member-row">
                <input
                  className="eval-post-write__member-input"
                  value={member}
                  onChange={(e) => setMembers((prev) => prev.map((m, i) => (i === idx ? e.target.value : m)))}
                  placeholder={`멤버 닉네임 ${idx + 1}`}
                  autoComplete="off"
                />
                {members.length > 1 && (
                  <button
                    type="button"
                    className="eval-post-write__member-btn eval-post-write__member-btn--remove"
                    onClick={() => setMembers((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    삭제
                  </button>
                )}
                {idx === members.length - 1 && (
                  <button
                    type="button"
                    className="eval-post-write__member-btn eval-post-write__member-btn--add"
                    onClick={() => setMembers((prev) => [...prev, ''])}
                  >
                    추가
                  </button>
                )}
              </div>
            ))}
          </section>
        )}

        {!isJudgeOnlyEdit && (
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
        )}

        <button className="submit-button" onClick={handleSubmit} disabled={loading}>
          <Save size={16} /> {loading ? '수정 중...' : '수정하기'}
        </button>
      </div>
    </div>
  );
};

export default EvaluationPostEdit;
