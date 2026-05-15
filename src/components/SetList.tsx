import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SetListManager from './SetList/SetListManager';
import SetListCards from './SetList/SetListCards';
import { useSetListData } from './SetList/hooks/useSetListData';
import './SetList/styles.css';

const pageBg: React.CSSProperties = {
  maxWidth: '100%',
  width: '100%',
  minHeight: '100vh',
  margin: 0,
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  borderRadius: 0,
  boxShadow: 'none',
  position: 'relative',
  overflow: 'hidden'
};

const SetList: React.FC = () => {
  const navigate = useNavigate();
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isLeader = Boolean(user && user.role === '리더');

  const [viewMode, setViewMode] = useState<'manage' | 'cards'>('manage');
  const { songs, setLists, activeSetList, loading } = useSetListData();

  const goToPerformView = useCallback(() => {
    setViewMode('cards');
  }, []);

  const [narrowScreen, setNarrowScreen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const apply = () => setNarrowScreen(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const isPerformFullscreen = isLeader && narrowScreen && viewMode === 'cards';
  const title = viewMode === 'manage' ? '관리' : '진행';

  const tabBtnStyle = (active: boolean, flex?: boolean): React.CSSProperties => ({
    ...(flex ? { flex: 1, minWidth: 0 } : {}),
    background: active ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.15)',
    backdropFilter: 'blur(10px)',
    color: 'white',
    border: 'none',
    borderRadius: 12,
    padding: flex ? '12px 8px' : '10px 16px',
    fontWeight: 600,
    fontSize: flex ? 13 : undefined,
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  });

  if (loading) {
    return (
      <div style={{ ...pageBg, padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 25% 25%, rgba(255, 255, 255, 0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(255, 255, 255, 0.08) 0%, transparent 50%)',
            pointerEvents: 'none'
          }}
        />
        <div
          style={{
            position: 'relative',
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(15px)',
            borderRadius: 20,
            padding: 32,
            border: '1px solid rgba(255, 255, 255, 0.2)',
            textAlign: 'center',
            color: 'white',
            fontSize: 18,
            fontWeight: 600
          }}
        >
          셋리스트 불러오는 중…
        </div>
      </div>
    );
  }

  return (
    <div
      className={isPerformFullscreen ? 'setlist-page--fullscreen' : ''}
      style={{ ...pageBg, padding: isPerformFullscreen ? 0 : '20px' }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 25% 25%, rgba(255, 255, 255, 0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(255, 255, 255, 0.08) 0%, transparent 50%)',
          pointerEvents: 'none'
        }}
      />

      <div className={`setlist-page-inner${isPerformFullscreen ? ' setlist-page-inner' : ''}`} style={{ position: 'relative', zIndex: 1 }}>
        {!isLeader ? (
          <div className="setlist-member-denied">
            <div>
              <p style={{ fontSize: 40, margin: '0 0 16px' }}>🔒</p>
              <p style={{ fontSize: 17, fontWeight: 700, margin: '0 0 10px' }}>리더 전용 기능입니다</p>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.55, margin: '0 0 20px' }}>
                셋리스트 관리·진행은 리더만 이용할 수 있어요.
              </p>
              <button
                type="button"
                onClick={() => navigate('/')}
                style={{
                  padding: '10px 20px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.35)',
                  background: 'rgba(255,255,255,0.15)',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                ← 메인으로
              </button>
            </div>
          </div>
        ) : (
          <>
            {isPerformFullscreen ? (
              <div className="setlist-page-header--compact">
                <h1 style={{ color: 'white', fontWeight: 700, textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                  🎴 진행
                </h1>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => setViewMode('manage')} style={tabBtnStyle(false)}>
                    관리
                  </button>
                  <button type="button" onClick={() => navigate('/')} style={tabBtnStyle(false)}>
                    홈
                  </button>
                </div>
              </div>
            ) : narrowScreen ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <h1
                    style={{
                      color: 'white',
                      fontWeight: 700,
                      fontSize: 24,
                      margin: 0,
                      textShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}
                  >
                    셋리스트 — {title}
                  </h1>
                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    style={{
                      marginTop: 10,
                      padding: '8px 14px',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.35)',
                      background: 'rgba(255,255,255,0.15)',
                      backdropFilter: 'blur(8px)',
                      color: 'white',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer'
                    }}
                  >
                    ← 메인 메뉴
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14, width: '100%', boxSizing: 'border-box' }}>
                  <button type="button" onClick={() => setViewMode('manage')} style={tabBtnStyle(viewMode === 'manage', true)}>
                    📋 관리
                  </button>
                  <button type="button" onClick={() => setViewMode('cards')} style={tabBtnStyle(viewMode === 'cards', true)}>
                    🎴 진행
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 16,
                  flexWrap: 'wrap',
                  gap: '16px'
                }}
              >
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <h1
                    style={{
                      color: 'white',
                      fontWeight: 700,
                      fontSize: 28,
                      margin: 0,
                      textShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}
                  >
                    셋리스트 — {title}
                  </h1>
                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    style={{
                      marginTop: 12,
                      padding: '10px 18px',
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.35)',
                      background: 'rgba(255,255,255,0.15)',
                      backdropFilter: 'blur(8px)',
                      color: 'white',
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: 'pointer'
                    }}
                  >
                    ← 메인 메뉴
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setViewMode('manage')} style={tabBtnStyle(viewMode === 'manage')}>
                    📋 관리
                  </button>
                  <button type="button" onClick={() => setViewMode('cards')} style={tabBtnStyle(viewMode === 'cards')}>
                    🎴 진행
                  </button>
                </div>
              </div>
            )}

            {viewMode === 'cards' ? (
              <SetListCards songs={songs} activeSetList={activeSetList} fullscreen={isPerformFullscreen} />
            ) : (
              <SetListManager
                setLists={setLists}
                activeSetList={activeSetList}
                onAfterSessionActivated={goToPerformView}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SetList;
