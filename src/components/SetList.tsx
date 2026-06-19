import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListMusic } from 'lucide-react';
import SetListManager from './SetList/SetListManager';
import SetListCards from './SetList/SetListCards';
import { useSetListData } from './SetList/hooks/useSetListData';
import { canManageSetList } from './SetList/setListPermissions';
import './SetList/styles.css';
import '../styles/warm-paper-setlist.css';

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
      <div className="setlist-loading-wrap">
        <div className="setlist-loading-card">셋리스트 불러오는 중…</div>
      </div>
    );
  }

  const pageClassName = [
    'setlist-page',
    isPerformFullscreen && 'setlist-page--fullscreen',
    showManage && 'setlist-page--manage',
  ]
    .filter(Boolean)
    .join(' ');

  const renderTabs = (flex?: boolean) =>
    canManage ? (
      <div className={`setlist-page-header__tabs${flex ? ' setlist-page-header__tabs--full' : ''}`}>
        <button type="button" onClick={() => setViewMode('manage')} className={tabBtnClass(viewMode === 'manage', flex)}>
          관리
        </button>
        <button type="button" onClick={() => setViewMode('cards')} className={tabBtnClass(viewMode === 'cards', flex)}>
          진행
        </button>
      </div>
    ) : null;

  return (
    <div className={pageClassName}>
      <div className={`setlist-page-inner${showManage ? ' setlist-page-inner--manage' : ''}`}>
        {isPerformFullscreen ? (
          <header className="setlist-page-header--compact">
            <h1 className="setlist-page-title setlist-page-title--sm">
              {canManage ? '진행' : '셋리스트'}
            </h1>
            <div className="setlist-page-header__tabs">
              {canManage && (
                <button type="button" onClick={() => setViewMode('manage')} className={tabBtnClass(false)}>
                  관리
                </button>
              )}
              <button type="button" onClick={() => navigate('/')} className={tabBtnClass(false)}>
                홈
              </button>
            </div>
          </header>
        ) : (
          <header className={`setlist-page-header${showManage ? ' setlist-page-header-block' : ''}`}>
            {narrowScreen ? (
              <>
                <div className="setlist-page-header__main">
                  <h1 className="setlist-page-title setlist-page-title--md">
                    <ListMusic size={20} className="setlist-page-title__icon" aria-hidden />
                    셋리스트
                  </h1>
                  <p className="setlist-page-sub">
                    {canManage ? `${title} 모드` : '진행 모드'}
                  </p>
                  <button type="button" onClick={() => navigate('/')} className="setlist-home-btn">
                    ← 메인 메뉴
                  </button>
                </div>
                {renderTabs(true)}
              </>
            ) : (
              <div className="setlist-page-header__row">
                <div className="setlist-page-header__main">
                  <h1 className="setlist-page-title setlist-page-title--lg">
                    <ListMusic size={22} className="setlist-page-title__icon" aria-hidden />
                    셋리스트
                  </h1>
                  <p className="setlist-page-sub">
                    {canManage ? `리더 ${title} · 참가자 진행 확인` : '오늘의 진행 순서'}
                  </p>
                  <button type="button" onClick={() => navigate('/')} className="setlist-home-btn">
                    ← 메인 메뉴
                  </button>
                </div>
                {renderTabs()}
              </div>
            )}
          </header>
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
