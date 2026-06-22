import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { ContestType } from '../types/contest';
import '../styles/variables.css';

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
  defaultTeamAName: string;
  defaultTeamBName: string;
}

const ContestCreateClassic: React.FC = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState<ContestFormData>({
    title: '',
    type: '경연',
    deadline: '',
    defaultTeamAName: 'A팀',
    defaultTeamBName: 'B팀',
  });

  const user = useMemo(() => {
    const userString = localStorage.getItem('veryus_user');
    return userString ? (JSON.parse(userString) as User) : null;
  }, []);

  const isAdmin = useMemo(() => {
    return user && ['리더', '운영진', '부운영진'].includes(user.role || '');
  }, [user]);

  const handleInputChange = useCallback((field: keyof ContestFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!formData.title || !formData.deadline) {
      alert('모든 항목을 입력하세요.');
      return;
    }

    if (formData.type === '라운드매치') {
      if (!formData.defaultTeamAName.trim() || !formData.defaultTeamBName.trim()) {
        alert('1라운드 팀 이름을 입력하세요.');
        return;
      }
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
      const payload: Record<string, unknown> = {
        title: formData.title,
        type: formData.type,
        deadline: deadlineDate,
        createdBy: user?.nickname,
        createdAt: serverTimestamp(),
        isStarted: false,
        ended: false,
        entryRestricted: true,
      };

      if (formData.type === '라운드매치') {
        payload.defaultTeamAName = formData.defaultTeamAName.trim();
        payload.defaultTeamBName = formData.defaultTeamBName.trim();
        payload.currentRoundId = null;
        payload.currentRoundNumber = 0;
      }

      await addDoc(collection(db, 'contests'), payload);
      navigate('/contests');
    } catch (error) {
      console.error('콘테스트 생성 에러:', error);
      alert('콘테스트 생성 중 오류가 발생했습니다.');
    }
  }, [formData, user, navigate]);

  const handleBackClick = useCallback(() => {
    navigate('/contests');
  }, [navigate]);

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

  const isRoundMatch = formData.type === '라운드매치';

  return (
    <div className="contest-create-container">
      <div className="contest-create-pattern" />

      <div className="contest-create-content">
        <div>
          <button className="contest-back-button" onClick={handleBackClick}>
            ← 콘테스트 메인으로
          </button>
        </div>

        <div className="contest-form">
          <h2 className="contest-title">🏆 콘테스트 생성</h2>

          <div className="contest-field">
            <label className="contest-label">콘테스트명</label>
            <input
              className="contest-input"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="콘테스트 이름을 입력하세요"
            />
          </div>

          <div className="contest-field">
            <label className="contest-label">유형</label>
            <select
              className="contest-select"
              value={formData.type}
              onChange={(e) => handleInputChange('type', e.target.value as ContestType)}
            >
              <option value="경연">등급전/경연 - 참가자 상호 평가 콘테스트</option>
              <option value="라운드매치">라운드매치 - A/B 팀 투표 대결</option>
            </select>
            <div
              style={{
                marginTop: '8px',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '14px',
                lineHeight: '1.6',
                background: isRoundMatch ? '#FFF7ED' : '#F6F2FF',
                border: isRoundMatch ? '1px solid #FED7AA' : '1px solid #8A55CC',
                color: isRoundMatch ? '#9A3412' : '#6B21A8',
              }}
            >
              {formData.type === '경연' && (
                <div>
                  <strong>🎭 등급전/경연</strong>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                    <li>참여 버튼을 누른 멤버가 참가자 목록에 표시됩니다</li>
                    <li>참가자들이 서로 점수를 부여하는 방식입니다</li>
                    <li>솔로·듀엣 팀 구성이 가능합니다</li>
                  </ul>
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '10px',
                      background: '#EFF6FF',
                      borderRadius: '6px',
                      border: '1px solid #BFDBFE',
                      color: '#1E40AF',
                      fontSize: '13px',
                    }}
                  >
                    <strong>📝 다음 단계:</strong> 생성 후 상세 페이지에서 참가자·평가 대상을 등록해주세요.
                  </div>
                </div>
              )}
              {isRoundMatch && (
                <div>
                  <strong>⚔️ 라운드매치</strong>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                    <li>등록된 참가자가 A팀/B팀 중 하나에 투표합니다</li>
                    <li>라운드마다 다른 팀 대결을 진행할 수 있습니다</li>
                    <li>리더가 라운드 종료 → 결과 공개 → 다음 라운드를 진행합니다</li>
                    <li>점수·등급 없이 투표와 코멘트만 사용합니다</li>
                  </ul>
                </div>
              )}
            </div>
          </div>

          {isRoundMatch && (
            <div className="contest-field">
              <label className="contest-label">1라운드 팀 이름 (미리 설정)</label>
              <div className="rm-team-edit-grid" style={{ marginTop: 8 }}>
                <input
                  className="contest-input"
                  value={formData.defaultTeamAName}
                  onChange={(e) => handleInputChange('defaultTeamAName', e.target.value)}
                  placeholder="예: A팀"
                />
                <input
                  className="contest-input"
                  value={formData.defaultTeamBName}
                  onChange={(e) => handleInputChange('defaultTeamBName', e.target.value)}
                  placeholder="예: B팀"
                />
              </div>
            </div>
          )}

          <div className="contest-field">
            <label className="contest-label">마감일</label>
            <input
              type="date"
              className="contest-input"
              value={formData.deadline}
              onChange={(e) => handleInputChange('deadline', e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          <button className="contest-submit-button" onClick={handleCreate}>
            🎯 콘테스트 생성
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContestCreateClassic;
