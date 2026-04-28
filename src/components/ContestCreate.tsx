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
    type: '경연',
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
        createdAt: serverTimestamp(),
        // 경연 유형도 개최 버튼을 눌러야 시작됨
        isStarted: false,
        ended: false,
        entryRestricted: false
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
              <option value="경연">등급전/경연 - 참가자 상호 평가 콘테스트</option>
            </select>
            {/* 유형별 설명 */}
            <div style={{ 
              marginTop: '8px', 
              padding: '12px', 
              borderRadius: '8px', 
              fontSize: '14px',
              lineHeight: '1.6',
              background: formData.type === '경연' ? '#F6F2FF' : '#F0F9FF',
              border: formData.type === '경연' ? '1px solid #8A55CC' : '1px solid #BAE6FD',
              color: formData.type === '경연' ? '#6B21A8' : '#0369A1'
            }}>
              {formData.type === '정규등급전' && (
                <div>
                  <strong>📋 정규등급전</strong>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                    <li>정식 등급 평가를 위한 콘테스트입니다</li>
                    <li>운영진이 참가자들을 평가합니다</li>
                    <li>등급 결정에 직접적으로 반영됩니다</li>
                  </ul>
                </div>
              )}
              {formData.type === '세미등급전' && (
                <div>
                  <strong>📋 세미등급전</strong>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                    <li>연습용 등급 평가 콘테스트입니다</li>
                    <li>운영진이 참가자들을 평가합니다</li>
                    <li>등급 결정에 참고용으로 사용됩니다</li>
                  </ul>
                </div>
              )}
              {formData.type === '경연' && (
                <div>
                  <strong>🎭 등급전/경연</strong>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                    <li>참가자들이 서로 평가하는 콘테스트입니다</li>
                    <li>솔로 참가 또는 듀엣 팀 구성이 가능합니다</li>
                    <li>각 참가자는 다른 참가자/팀을 평가합니다</li>
                    <li>본인 또는 본인이 속한 팀은 평가할 수 없습니다</li>
                    <li>0~100점 사이로 점수를 부여할 수 있습니다</li>
                  </ul>
                  <div style={{ 
                    marginTop: '12px', 
                    padding: '10px', 
                    background: '#FFF7ED', 
                    borderRadius: '6px',
                    border: '1px solid #FED7AA',
                    color: '#9A3412',
                    fontSize: '13px'
                  }}>
                    <strong>💡 참고사항:</strong> 등급전/경연은 참가자 상호 평가 방식이므로, 참가자들이 모두 평가를 완료할 수 있도록 충분한 마감일을 설정해주세요.
                  </div>
                  <div style={{ 
                    marginTop: '8px', 
                    padding: '10px', 
                    background: '#EFF6FF', 
                    borderRadius: '6px',
                    border: '1px solid #BFDBFE',
                    color: '#1E40AF',
                    fontSize: '13px'
                  }}>
                    <strong>📝 다음 단계:</strong> 콘테스트 생성 후 상세 페이지에서 참가자를 추가하고, 필요시 듀엣 팀을 구성해주세요.
                  </div>
                </div>
              )}
            </div>
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
              min={new Date().toISOString().split('T')[0]}
            />
            {formData.type === '경연' && (
              <div style={{ 
                marginTop: '8px', 
                fontSize: '13px', 
                color: '#6B7280',
                fontStyle: 'italic'
              }}>
                💡 경연의 경우 참가자들이 서로 평가하므로 충분한 시간을 확보해주세요.
              </div>
            )}
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