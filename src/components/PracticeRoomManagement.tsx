import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, getDocs, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, Plus, Trash2, Calendar, CheckCircle, XCircle } from 'lucide-react';
import {
  loadPracticeRoomAlwaysOpenSettings,
  savePracticeRoomAlwaysOpenSettings,
  type PracticeRoomAlwaysOpenSettings,
} from '../utils/practiceRoomAlwaysOpen';
import './PracticeRoomManagement.css';

interface BlockingRule {
  id: string;
  name: string;
  weekdays: number[]; // 0=일, 1=월, 2=화, 3=수, 4=목, 5=금, 6=토
  startDate: string; // YYYY-MM-DD
  endDate?: string; // 선택사항: YYYY-MM-DD
  reason: string;
  isActive: boolean;
  createdBy: string;
  createdAt: any;
}

const PracticeRoomManagement: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rules, setRules] = useState<BlockingRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // 새 규칙 입력 필드
  const [ruleName, setRuleName] = useState('');
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const [alwaysOpenEnabled, setAlwaysOpenEnabled] = useState(false);
  const [alwaysOpenStartDate, setAlwaysOpenStartDate] = useState('');
  const [alwaysOpenEndDate, setAlwaysOpenEndDate] = useState('');
  const [alwaysOpenSaving, setAlwaysOpenSaving] = useState(false);

  const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];

  useEffect(() => {
    console.log('🔍 연습실 관리 페이지 진입...');
    
    // localStorage에서 사용자 정보 가져오기 (키: veryus_user)
    const userStr = localStorage.getItem('veryus_user');
    console.log('📦 localStorage veryus_user:', userStr);
    
    const user = JSON.parse(userStr || '{}');
    console.log('👤 사용자 정보:', user);
    console.log('  - nickname:', user.nickname);
    
    setCurrentUser(user);
    setIsAdmin(true); // 이 페이지에 접근했다면 관리자로 간주
    
    console.log('✅ 규칙 로딩 시작');
    loadRules();
    loadAlwaysOpenSettings();
  }, []);

  const loadAlwaysOpenSettings = async () => {
    try {
      const settings = await loadPracticeRoomAlwaysOpenSettings();
      if (settings) {
        setAlwaysOpenEnabled(settings.enabled);
        setAlwaysOpenStartDate(settings.startDate);
        setAlwaysOpenEndDate(settings.endDate);
      }
    } catch (error) {
      console.error('상시개방 설정 로딩 실패:', error);
    }
  };

  const handleSaveAlwaysOpen = async () => {
    if (alwaysOpenEnabled) {
      if (!alwaysOpenStartDate) {
        alert('상시개방 시작 날짜를 선택해주세요.');
        return;
      }
      if (!alwaysOpenEndDate) {
        alert('상시개방 종료 날짜를 선택해주세요.');
        return;
      }
      if (alwaysOpenEndDate < alwaysOpenStartDate) {
        alert('종료 날짜는 시작 날짜보다 이후여야 합니다.');
        return;
      }
    }

    setAlwaysOpenSaving(true);
    try {
      const payload: PracticeRoomAlwaysOpenSettings = {
        enabled: alwaysOpenEnabled,
        startDate: alwaysOpenStartDate,
        endDate: alwaysOpenEndDate,
      };
      await savePracticeRoomAlwaysOpenSettings(
        payload,
        currentUser?.nickname || '관리자'
      );
      alert('상시개방 설정이 저장되었습니다.');
    } catch (error) {
      console.error('상시개방 설정 저장 실패:', error);
      alert('상시개방 설정 저장에 실패했습니다.');
    } finally {
      setAlwaysOpenSaving(false);
    }
  };

  const loadRules = async () => {
    try {
      console.log('차단 규칙 로딩 시작...');
      const q = query(collection(db, 'blockingRules'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BlockingRule[];
      
      console.log('차단 규칙 로딩됨:', data.length, '개');
      setRules(data);
    } catch (error) {
      console.error('차단 규칙 로딩 실패:', error);
    }
  };

  const handleAddRule = async () => {
    if (!ruleName.trim()) {
      alert('규칙 이름을 입력해주세요.');
      return;
    }
    
    if (selectedWeekdays.length === 0) {
      alert('차단할 요일을 선택해주세요.');
      return;
    }
    
    if (!startDate) {
      alert('시작 날짜를 선택해주세요.');
      return;
    }
    
    if (!reason.trim()) {
      alert('차단 사유를 입력해주세요.');
      return;
    }
    
    setLoading(true);
    try {
      console.log('새 차단 규칙 생성 중...');
      await addDoc(collection(db, 'blockingRules'), {
        name: ruleName,
        weekdays: selectedWeekdays.sort((a, b) => a - b),
        startDate: startDate,
        endDate: endDate || null,
        reason: reason,
        isActive: true,
        createdBy: currentUser?.nickname || '관리자',
        createdAt: serverTimestamp()
      });
      
      alert('차단 규칙이 생성되었습니다.');
      setShowAddModal(false);
      resetForm();
      await loadRules();
    } catch (error) {
      console.error('차단 규칙 생성 실패:', error);
      alert('차단 규칙 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRule = async (rule: BlockingRule) => {
    setLoading(true);
    try {
      console.log('차단 규칙 토글:', rule.id, !rule.isActive);
      await updateDoc(doc(db, 'blockingRules', rule.id), {
        isActive: !rule.isActive
      });
      
      alert(rule.isActive ? '규칙이 비활성화되었습니다.' : '규칙이 활성화되었습니다.');
      await loadRules();
    } catch (error) {
      console.error('차단 규칙 토글 실패:', error);
      alert('차단 규칙 변경에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRule = async (rule: BlockingRule) => {
    if (!confirm(`"${rule.name}" 규칙을 삭제하시겠습니까?`)) {
      return;
    }
    
    setLoading(true);
    try {
      console.log('차단 규칙 삭제:', rule.id);
      await deleteDoc(doc(db, 'blockingRules', rule.id));
      
      alert('규칙이 삭제되었습니다.');
      await loadRules();
    } catch (error) {
      console.error('차단 규칙 삭제 실패:', error);
      alert('차단 규칙 삭제에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const toggleWeekday = (day: number) => {
    if (selectedWeekdays.includes(day)) {
      setSelectedWeekdays(selectedWeekdays.filter(d => d !== day));
    } else {
      setSelectedWeekdays([...selectedWeekdays, day]);
    }
  };

  const resetForm = () => {
    setRuleName('');
    setSelectedWeekdays([]);
    setStartDate('');
    setEndDate('');
    setReason('');
  };

  return (
    <div className="practice-room-management">
      <div className="management-header">
        <button className="back-button" onClick={() => navigate('/practice-room-booking')}>
          <ArrowLeft size={20} />
          <span>뒤로가기</span>
        </button>
        <h1>⚙️ 연습실 관리</h1>
      </div>

      <div className="management-content">
        <section className="always-open-section">
          <div className="section-header">
            <h2>🟢 상시개방 설정</h2>
          </div>
          <p className="always-open-description">
            활성화하면 설정한 기간 동안 예약이 불가하며, 사용자에게 상시개방 안내가 표시됩니다.
          </p>
          <label className="always-open-toggle">
            <input
              type="checkbox"
              checked={alwaysOpenEnabled}
              onChange={(e) => setAlwaysOpenEnabled(e.target.checked)}
            />
            <span>상시개방 활성화</span>
          </label>
          <div className={`always-open-dates ${alwaysOpenEnabled ? '' : 'disabled'}`}>
            <div className="form-group">
              <label>시작 날짜 <span className="required">*</span></label>
              <input
                type="date"
                value={alwaysOpenStartDate}
                onChange={(e) => setAlwaysOpenStartDate(e.target.value)}
                disabled={!alwaysOpenEnabled}
              />
            </div>
            <div className="form-group">
              <label>종료 날짜 <span className="required">*</span></label>
              <input
                type="date"
                value={alwaysOpenEndDate}
                onChange={(e) => setAlwaysOpenEndDate(e.target.value)}
                min={alwaysOpenStartDate}
                disabled={!alwaysOpenEnabled}
              />
            </div>
          </div>
          <button
            type="button"
            className="save-always-open-btn"
            onClick={handleSaveAlwaysOpen}
            disabled={alwaysOpenSaving}
          >
            {alwaysOpenSaving ? '저장 중...' : '상시개방 설정 저장'}
          </button>
        </section>

        <div className="section-header">
          <h2>🔄 반복 차단 규칙</h2>
          <button className="add-rule-btn" onClick={() => setShowAddModal(true)}>
            <Plus size={18} />
            <span>규칙 추가</span>
          </button>
        </div>

        <div className="rules-list">
          {rules.length === 0 ? (
            <div className="empty-state">
              <p>설정된 차단 규칙이 없습니다.</p>
              <p className="empty-hint">규칙을 추가하여 특정 요일을 자동으로 차단하세요.</p>
            </div>
          ) : (
            rules.map(rule => (
              <div key={rule.id} className={`rule-card ${rule.isActive ? 'active' : 'inactive'}`}>
                <div className="rule-main">
                  <div className="rule-info">
                    <h3 className="rule-name">{rule.name}</h3>
                    <div className="rule-details">
                      <div className="detail-item">
                        <Calendar size={14} />
                        <span>
                          {rule.weekdays.map(d => weekdayNames[d]).join(', ')}
                        </span>
                      </div>
                      <div className="detail-item">
                        📅 {rule.startDate} {rule.endDate ? `~ ${rule.endDate}` : '~ 계속'}
                      </div>
                      <div className="detail-item">
                        💡 {rule.reason}
                      </div>
                      <div className="detail-item">
                        👤 {rule.createdBy}
                      </div>
                    </div>
                  </div>
                  <div className="rule-actions">
                    <button
                      className={`toggle-btn ${rule.isActive ? 'active' : 'inactive'}`}
                      onClick={() => handleToggleRule(rule)}
                      disabled={loading}
                    >
                      {rule.isActive ? (
                        <>
                          <CheckCircle size={16} />
                          <span>활성</span>
                        </>
                      ) : (
                        <>
                          <XCircle size={16} />
                          <span>비활성</span>
                        </>
                      )}
                    </button>
                    <button
                      className="delete-rule-btn"
                      onClick={() => handleDeleteRule(rule)}
                      disabled={loading}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 규칙 추가 모달 */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>새 차단 규칙 추가</h3>
              <button className="close-button" onClick={() => setShowAddModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>규칙 이름 <span className="required">*</span></label>
                <input
                  type="text"
                  placeholder="예: 주말 연습실 차단"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  maxLength={50}
                />
              </div>

              <div className="form-group">
                <label>차단할 요일 선택 <span className="required">*</span></label>
                <div className="weekday-selector">
                  {weekdayNames.map((name, idx) => (
                    <button
                      key={idx}
                      className={`weekday-btn ${selectedWeekdays.includes(idx) ? 'selected' : ''}`}
                      onClick={() => toggleWeekday(idx)}
                      type="button"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>시작 날짜 <span className="required">*</span></label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>종료 날짜 (선택사항)</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                />
                <p className="form-hint">비워두면 계속 적용됩니다</p>
              </div>

              <div className="form-group">
                <label>차단 사유 <span className="required">*</span></label>
                <input
                  type="text"
                  placeholder="예: 주말 행사 진행"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={100}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="cancel-btn"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                disabled={loading}
              >
                취소
              </button>
              <button
                className="confirm-btn"
                onClick={handleAddRule}
                disabled={loading}
              >
                {loading ? '생성 중...' : '규칙 추가'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PracticeRoomManagement;

