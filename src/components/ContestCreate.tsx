import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import '../styles/variables.css';
import '../styles/components.css';

type ContestType = '정규등급전' | '세미등급전' | '경연';

interface User {
  uid: string;
  email: string;
  nickname?: string;
  isLoggedIn: boolean;
  role?: string;
}

interface ContestFormData {
  title: string;
  type: ContestType;
  deadline: string;
}

const ContestCreate: React.FC = () => {
  const navigate = useNavigate();
  
  // State
  const [formData, setFormData] = useState<ContestFormData>({
    title: '',
    type: '정규등급전',
    deadline: ''
  });

  // User data
  const user = useMemo(() => {
    const userString = localStorage.getItem('veryus_user');
    return userString ? JSON.parse(userString) as User : null;
  }, []);

  const isAdmin = useMemo(() => {
    return user && ['리더', '운영진', '부운영진'].includes(user.role || '');
  }, [user]);

  // Callbacks
  const handleInputChange = useCallback((field: keyof ContestFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!formData.title || !formData.deadline) {
      alert('모든 항목을 입력하세요.');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineDate = new Date(formData.deadline);
    deadlineDate.setHours(0, 0, 0, 0);

    if (deadlineDate < today) {
      alert('마감일은 오늘 이후로만 설정할 수 있습니다.');
      return;
    }

    try {
      await addDoc(collection(db, 'contests'), {
        title: formData.title,
        type: formData.type,
        deadline: deadlineDate,
        createdBy: user?.nickname,
        createdAt: serverTimestamp()
      });
      navigate('/contests');
    } catch (error) {
      console.error('콘테스트 생성 에러:', error);
      alert('콘테스트 생성 중 오류가 발생했습니다.');
    }
  }, [formData, user, navigate]);

  const handleBackClick = useCallback(() => {
    navigate('/contests');
  }, [navigate]);

  // Access denied component
  if (!isAdmin) {
    return (
      <div className="access-denied-container">
        <div className="access-denied-content">
          <div className="access-denied-icon">🚫</div>
          <div className="access-denied-text">권한이 없습니다.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="contest-create-container">
      {/* 배경 패턴 */}
      <div className="contest-create-pattern" />
      
      <div className="contest-create-content">
        {/* 뒤로가기 버튼 */}
        <div>
          <button
            className="contest-back-button"
            onClick={handleBackClick}
          >
            ← 콘테스트 메인으로
          </button>
        </div>

        {/* 메인 폼 */}
        <div className="contest-form">
          <h2 className="contest-title">
            🏆 콘테스트 생성
          </h2>
          
          <div className="contest-field">
            <label className="contest-label">
              콘테스트명
            </label>
            <input 
              className="contest-input"
              value={formData.title} 
              onChange={e => handleInputChange('title', e.target.value)} 
              placeholder="콘테스트 이름을 입력하세요"
            />
          </div>
          
          <div className="contest-field">
            <label className="contest-label">
              유형
            </label>
            <select 
              className="contest-select"
              value={formData.type} 
              onChange={e => handleInputChange('type', e.target.value as ContestType)} 
            >
              <option value="정규등급전">정규등급전</option>
              <option value="세미등급전">세미등급전</option>
              <option value="경연">경연</option>
            </select>
          </div>
          
          <div className="contest-field">
            <label className="contest-label">
              평가 마감일
            </label>
            <input 
              type="date" 
              className="contest-input"
              value={formData.deadline} 
              onChange={e => handleInputChange('deadline', e.target.value)} 
            />
          </div>
          
          <button 
            className="contest-submit-button"
            onClick={handleCreate}
          >
            🎯 콘테스트 생성
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContestCreate; 