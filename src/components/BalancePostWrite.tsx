import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Loader, PenTool, Save, X } from 'lucide-react';
import { db } from '../firebase';

interface User {
  uid: string;
  nickname?: string;
}

const BalancePostWrite: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [isAnonymousVote, setIsAnonymousVote] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  const user = (() => {
    const userStr = localStorage.getItem('veryus_user');
    return userStr ? (JSON.parse(userStr) as User) : null;
  })();

  useEffect(() => {
    if (!id) return;
    setIsEditMode(true);
    (async () => {
      const postSnap = await getDoc(doc(db, 'posts', id));
      if (!postSnap.exists()) {
        alert('게시글을 찾을 수 없습니다.');
        navigate('/balance');
        return;
      }
      const data = postSnap.data();
      setTitle(data.title || '');
      setOptionA(data.balanceOptionA || '');
      setOptionB(data.balanceOptionB || '');
      setIsAnonymousVote(data.isAnonymousVote === true);
    })();
  }, [id, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isComposing) {
      alert('입력 중인 글자를 확정한 뒤 다시 저장해주세요.');
      return;
    }
    if (!user) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    if (!title.trim() || !optionA.trim() || !optionB.trim()) {
      alert('제목과 두 가지 선택지를 모두 입력해주세요.');
      return;
    }
    if (optionA.trim() === optionB.trim()) {
      alert('두 선택지는 서로 다르게 입력해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        title: title.trim(),
        content: '',
        type: 'balance',
        writerUid: user.uid,
        writerNickname: user.nickname || '익명',
        balanceOptionA: optionA.trim(),
        balanceOptionB: optionB.trim(),
        votesA: 0,
        votesB: 0,
        votedUsers: [],
        votedMap: {},
        votedUserNicknames: {},
        isAnonymousVote,
        likesCount: 0,
        commentCount: 0,
        views: 0,
        likes: [],
        updatedAt: serverTimestamp()
      };

      if (isEditMode && id) {
        await updateDoc(doc(db, 'posts', id), {
          title: payload.title,
          balanceOptionA: payload.balanceOptionA,
          balanceOptionB: payload.balanceOptionB,
          isAnonymousVote: payload.isAnonymousVote,
          updatedAt: payload.updatedAt
        });
        alert('밸런스 글이 수정되었습니다.');
        navigate(`/balance/${id}`);
      } else {
        await addDoc(collection(db, 'posts'), {
          ...payload,
          createdAt: serverTimestamp()
        });
        navigate('/balance');
      }
    } catch (error) {
      console.error('밸런스 글 저장 실패:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="write-page">
      <div className="write-form">
        <div className="write-form-header">
          <PenTool size={24} />
          <h1 className="write-form-title">{isEditMode ? '밸런스 글 수정' : '밸런스 글 작성'}</h1>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">제목</label>
            <input
              className="title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              maxLength={100}
            />
          </div>
          <div className="form-group">
            <label className="form-label">선택지 A</label>
            <input
              className="title-input"
              value={optionA}
              onChange={(e) => setOptionA(e.target.value)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              maxLength={80}
            />
          </div>
          <div className="form-group">
            <label className="form-label">선택지 B</label>
            <input
              className="title-input"
              value={optionB}
              onChange={(e) => setOptionB(e.target.value)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              maxLength={80}
            />
          </div>
          <div className="form-group">
            <label className="balance-vote-privacy-toggle">
              <input
                type="checkbox"
                checked={isAnonymousVote}
                onChange={(e) => setIsAnonymousVote(e.target.checked)}
              />
              <span>익명 투표로 진행</span>
            </label>
            <p className="balance-vote-privacy-help">
              체크 해제 시 게시글 상세에서 항목별 투표자 닉네임이 공개됩니다.
            </p>
          </div>
          <div className="form-footer">
            <button type="button" className="cancel-button" onClick={() => navigate(isEditMode && id ? `/balance/${id}` : '/balance')}>
              <X size={18} />
              취소
            </button>
            <button type="submit" className="submit-button" disabled={isSubmitting}>
              {isSubmitting ? <><Loader className="loading-spinner" size={18} />저장 중...</> : <><Save size={18} />{isEditMode ? '수정완료' : '작성완료'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BalancePostWrite;
