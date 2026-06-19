import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SetListManager from './SetList/SetListManager';
import SetListCards from './SetList/SetListCards';
import { useSetListData } from './SetList/hooks/useSetListData';
import { canManageSetList } from './SetList/setListPermissions';
import './SetList/styles.css';

const pageBg: React.CSSProperties = {
  maxWidth: '100%',
  width: '100%',
  minHeight: '100vh',
  margin: 0,
  background: 'var(--paper-bg, #f5f0e8)',
  borderRadius: 0,
  boxShadow: 'none',
  position: 'relative',
  overflow: 'hidden'
};

const SetList: React.FC = () => {
  const navigate = useNavigate();
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const canManage = canManageSetList(user?.role);

  const [viewMode, setViewMode] = useState<'manage' | 'cards'>(canManage ? 'manage' : 'cards');
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

  useEffect(() => {
    if (!canManage && viewMode === 'manage') {
      setViewMode('cards');
    }
  }, [canManage, viewMode]);

  // 진행 탭: 하단 네비 자동 접기 (채팅 입력창 가림 방지)
  useEffect(() => {
    const performActive = viewMode === 'cards';
    try {
      if (performActive) {
        sessionStorage.setItem('setlistPerformMode', '1');
      } else {
        sessionStorage.removeItem('setlistPerformMode');
      }
    } catch {
      /* sessionStorage unavailable */
    }
    window.dispatchEvent(new Event('veryus-bottom-nav-sync'));
    return () => {
      try {
        sessionStorage.removeItem('setlistPerformMode');
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event('veryus-bottom-nav-sync'));
    };
  }, [viewMode]);

  const showManage = canManage && viewMode === 'manage';
  const isPerformFullscreen = narrowScreen && viewMode === 'cards';
  const title = showManage ? '관리' : '진행';

  const tabBtnClass = (active: boolean, flex?: boolean) =>
    `setlist-tab-btn${active ? ' setlist-tab-btn--active' : ''}${flex ? ' setlist-tab-btn--flex' : ''}`;

  if (loading) {
    return (
      <div style={{ ...pageBg, padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="setlist-loading-card" style={{ borderRadius: 4, padding: 32, textAlign: 'center', fontSize: 18, fontWeight: 600 }}>
          셋리스트 불러오는 중…
        </div>
      </div>
    );
  }

  const pageClassName = [
    isPerformFullscreen && 'setlist-page--fullscreen',
    showManage && 'setlist-page--manage'
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={pageClassName}
      style={{
        ...pageBg,
        padding: isPerformFullscreen || showManage ? 0 : '20px'
      }}
    >
      <div
        className={`setlist-page-inner${showManage ? ' setlist-page-inner--manage' : ''}`}
        style={{ position: 'relative', zIndex: 1 }}
      >
        {isPerformFullscreen ? (
          <div className="setlist-page-header--compact">
            <h1 className="setlist-page-title" style={{ fontSize: 15 }}>
              {canManage ? '진행' : '셋리스트'}
            </h1>
            <div style={{ display: 'flex', gap: 6 }}>
              {canManage && (
                <button type="button" onClick={() => setViewMode('manage')} className={tabBtnClass(false)}>
                  관리
                </button>
              )}
              <button type="button" onClick={() => navigate('/')} className={tabBtnClass(false)}>
                홈
              </button>
            </div>
          </div>
        ) : narrowScreen ? (
          <div className={showManage ? 'setlist-page-header-block' : ''} style={{ marginBottom: showManage ? 0 : 16 }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <h1 className="setlist-page-title" style={{ fontSize: 24 }}>
                {canManage ? `셋리스트 — ${title}` : '셋리스트 — 진행'}
              </h1>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="setlist-home-btn"
                style={{ marginTop: narrowScreen && !isPerformFullscreen ? 10 : 0 }}
              >
                ← 메인 메뉴
              </button>
            </div>
            {canManage && (
              <div style={{ display: 'flex', gap: 8, marginTop: 14, width: '100%', boxSizing: 'border-box' }}>
                <button type="button" onClick={() => setViewMode('manage')} className={tabBtnClass(viewMode === 'manage', true)}>
                  관리
                </button>
                <button type="button" onClick={() => setViewMode('cards')} className={tabBtnClass(viewMode === 'cards', true)}>
                  진행
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            className={showManage ? 'setlist-page-header-block' : ''}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: showManage ? 0 : 16,
              flexWrap: 'wrap',
              gap: '16px'
            }}
          >
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <h1 className="setlist-page-title" style={{ fontSize: 28 }}>
                {canManage ? `셋리스트 — ${title}` : '셋리스트 — 진행'}
              </h1>
              <button type="button" onClick={() => navigate('/')} className="setlist-home-btn">
                ← 메인 메뉴
              </button>
            </div>
            {canManage && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setViewMode('manage')} className={tabBtnClass(viewMode === 'manage')}>
                  관리
                </button>
                <button type="button" onClick={() => setViewMode('cards')} className={tabBtnClass(viewMode === 'cards')}>
                  진행
                </button>
              </div>
            )}
          </div>
        )}

        {showManage ? (
          <SetListManager
            setLists={setLists}
            activeSetList={activeSetList}
            onAfterSessionActivated={goToPerformView}
          />
        ) : (
          <SetListCards songs={songs} activeSetList={activeSetList} fullscreen={isPerformFullscreen} />
        )}
      </div>
    </div>
  );
};

export default SetList;
