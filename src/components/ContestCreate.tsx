import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const ContestCreate: React.FC = () => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'정규등급전' | '세미등급전' | '경연'>('정규등급전');
  const [deadline, setDeadline] = useState('');
  const navigate = useNavigate();
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isAdmin = user && ['리더', '운영진', '부운영진'].includes(user.role);

  if (!isAdmin) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        backgroundAttachment: 'fixed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: '20px',
          padding: '40px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
          <div style={{ color: 'white', fontSize: '18px', fontWeight: 600 }}>권한이 없습니다.</div>
        </div>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!title || !deadline) return alert('모든 항목을 입력하세요.');
    const today = new Date();
    today.setHours(0,0,0,0);
    const deadlineDate = new Date(deadline);
    deadlineDate.setHours(0,0,0,0);
    if (deadlineDate < today) {
      alert('마감일은 오늘 이후로만 설정할 수 있습니다.');
      return;
    }
    await addDoc(collection(db, 'contests'), {
      title,
      type,
      deadline: deadlineDate,
      createdBy: user.nickname,
      createdAt: serverTimestamp()
    });
    navigate('/contests');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      backgroundAttachment: 'fixed',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* 배경 패턴 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `
          radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 40% 80%, rgba(120, 119, 198, 0.2) 0%, transparent 50%)
        `,
        pointerEvents: 'none'
      }} />
      
      <div style={{
        position: 'relative',
        zIndex: 1,
        padding: '20px',
        maxWidth: '600px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        justifyContent: 'center'
      }}>
        {/* 뒤로가기 버튼 */}
        <div style={{ marginBottom: '20px' }}>
          <button
            style={{ 
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              color: 'white', 
              borderRadius: '12px', 
              padding: '12px 24px', 
              fontWeight: 600, 
              fontSize: 16, 
              border: '1px solid rgba(255, 255, 255, 0.3)', 
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
            onClick={() => navigate('/contests')}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            ← 콘테스트 메인으로
          </button>
        </div>

        {/* 메인 폼 */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: '20px',
          padding: '40px',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <h2 style={{ 
            color: 'white', 
            fontWeight: 700, 
            fontSize: 28, 
            marginBottom: 32,
            textAlign: 'center',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
          }}>
            🏆 콘테스트 생성
          </h2>
          
          <div style={{ marginBottom: 24 }}>
            <label style={{ 
              display: 'block',
              fontWeight: 600, 
              color: 'white', 
              marginBottom: 8,
              fontSize: 16
            }}>
              콘테스트명
            </label>
            <input 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              placeholder="콘테스트 이름을 입력하세요"
              style={{ 
                width: '100%', 
                padding: '12px 16px', 
                borderRadius: '12px', 
                border: '1px solid rgba(255, 255, 255, 0.3)', 
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                color: 'white',
                fontSize: 16,
                boxSizing: 'border-box',
                transition: 'all 0.3s ease'
              }}
              onFocus={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.5)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.3)';
              }}
            />
          </div>
          
          <div style={{ marginBottom: 24 }}>
            <label style={{ 
              display: 'block',
              fontWeight: 600, 
              color: 'white', 
              marginBottom: 8,
              fontSize: 16
            }}>
              유형
            </label>
            <select 
              value={type} 
              onChange={e => setType(e.target.value as any)} 
              style={{ 
                width: '100%', 
                padding: '12px 16px', 
                borderRadius: '12px', 
                border: '1px solid rgba(255, 255, 255, 0.3)', 
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                color: 'white',
                fontSize: 16,
                boxSizing: 'border-box',
                transition: 'all 0.3s ease'
              }}
              onFocus={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.5)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.3)';
              }}
            >
              <option value="정규등급전" style={{ background: '#667eea', color: 'white' }}>정규등급전</option>
              <option value="세미등급전" style={{ background: '#667eea', color: 'white' }}>세미등급전</option>
              <option value="경연" style={{ background: '#667eea', color: 'white' }}>경연</option>
            </select>
          </div>
          
          <div style={{ marginBottom: 32 }}>
            <label style={{ 
              display: 'block',
              fontWeight: 600, 
              color: 'white', 
              marginBottom: 8,
              fontSize: 16
            }}>
              평가 마감일
            </label>
            <input 
              type="date" 
              value={deadline} 
              onChange={e => setDeadline(e.target.value)} 
              style={{ 
                width: '100%', 
                padding: '12px 16px', 
                borderRadius: '12px', 
                border: '1px solid rgba(255, 255, 255, 0.3)', 
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                color: 'white',
                fontSize: 16,
                boxSizing: 'border-box',
                transition: 'all 0.3s ease'
              }}
              onFocus={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.5)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.3)';
              }}
            />
          </div>
          
          <button 
            style={{ 
              background: 'rgba(34, 197, 94, 0.8)',
              backdropFilter: 'blur(10px)',
              color: 'white', 
              borderRadius: '12px', 
              padding: '16px 24px', 
              fontWeight: 600, 
              fontSize: 18, 
              border: '1px solid rgba(255, 255, 255, 0.3)', 
              cursor: 'pointer', 
              width: '100%',
              transition: 'all 0.3s ease',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
            }} 
            onClick={handleCreate}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(34, 197, 94, 0.9)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(34, 197, 94, 0.8)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            🎯 콘테스트 생성
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContestCreate; 