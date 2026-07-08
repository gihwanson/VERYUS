import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SetListManagerClassic from './SetList/SetListManagerClassic';
import SetListCards from './SetList/SetListCards';
import FreeSongPanel from './SetList/FreeSong/FreeSongPanel';
import FreeSongAdminPanel from './SetList/FreeSong/FreeSongAdminPanel';
import FreeSongOrderPanel from './SetList/FreeSong/FreeSongOrderPanel';
import FreeSongStatsPanel from './SetList/FreeSong/FreeSongStatsPanel';
import BuskingMemberRosterPanel from './SetList/BuskingMember/BuskingMemberRosterPanel';
import BuskingNav, { type BuskingCategory, type FreeSongView, type SetlistView } from './SetList/BuskingNav';
import BuskingSessionShell from './SetList/BuskingSessionShell';
import { useSetListData } from './SetList/hooks/useSetListData';
import { useBuskingSession } from './SetList/hooks/useBuskingSession';
import { useBuskingSessionBootstrap } from './SetList/hooks/useBuskingSessionBootstrap';
import { useFreeSongSubmissions } from './SetList/FreeSong/useFreeSongSubmissions';
import {
  canAccessBuskingManage,
  canHostBuskingSession,
  canManageBuskingSession,
} from './SetList/buskingSessionPermissions';
import './SetList/styles.css';

const pageBg: React.CSSProperties = {
  maxWidth: '100%',
  width: '100%',
  minHeight: '100vh',
  margin: 0,
  background: 'var(--app-page-gradient)',
  borderRadius: 0,
  boxShadow: 'none',
  position: 'relative',
  overflow: 'hidden',
};

const SetListClassic: React.FC = () => {
  const navigate = useNavigate();
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const sessionUser = user?.uid
    ? { uid: user.uid, nickname: user.nickname || '', role: user.role }
    : null;

  const canAccessManage = canAccessBuskingManage(user?.role);
  const canHost = canHostBuskingSession(sessionUser);

  const [category, setCategory] = useState<BuskingCategory>('freeSong');
  const [freeSongView, setFreeSongView] = useState<FreeSongView>(canAccessManage ? 'roster' : 'submit');
  const [setlistView, setSetlistView] = useState<SetlistView>(canAccessManage ? 'manage' : 'cards');

  const { songs, setLists, loading } = useSetListData();
  const {
    activeSetList,
    setSelectedSessionId,
    liveSessionsToday,
    hostHasLiveSession,
    needsSessionPicker,
  } = useBuskingSession(setLists, sessionUser);

  const canManageCurrent = canManageBuskingSession(activeSetList, sessionUser);

  const { bootstrapping, bootstrapError, retryBootstrap, awaitingVenue, createSession } =
    useBuskingSessionBootstrap(setLists, hostHasLiveSession, canHost, sessionUser);

  const submissionsState = useFreeSongSubmissions(
    activeSetList,
    user?.nickname || '',
    user?.uid || '',
    loading
  );

  const goToPerformView = useCallback(() => {
    setCategory('setlist');
    setSetlistView('cards');
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
    if (!canManageCurrent && setlistView === 'manage') {
      setSetlistView('cards');
    }
  }, [canManageCurrent, setlistView]);

  useEffect(() => {
    if (!canManageCurrent && (freeSongView === 'admin' || freeSongView === 'roster' || freeSongView === 'stats')) {
      setFreeSongView('submit');
    }
  }, [canManageCurrent, freeSongView]);

  useEffect(() => {
    const performActive = category === 'setlist' && setlistView === 'cards';
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
  }, [category, setlistView]);

  const showSetlistManage = category === 'setlist' && canManageCurrent && setlistView === 'manage';
  const isPerformFullscreen = category === 'setlist' && narrowScreen && setlistView === 'cards';

  const tabBtnStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.15)',
    backdropFilter: 'blur(10px)',
    color: 'white',
    border: 'none',
    borderRadius: 12,
    padding: '10px 16px',
    fontWeight: 600,
    cursor: 'pointer',
  };

  if (loading) {
    return (
      <div style={{ ...pageBg, padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 25% 25%, rgba(255, 255, 255, 0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(255, 255, 255, 0.08) 0%, transparent 50%)',
            pointerEvents: 'none',
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
            fontWeight: 600,
          }}
        >
          버스킹 불러오는 중…
        </div>
      </div>
    );
  }

  const isBuskingFullWidth = category === 'freeSong' || showSetlistManage || isPerformFullscreen;

  const pageClassName = [
    'setlist-page',
    `setlist-page--${category}`,
    isPerformFullscreen && 'setlist-page--fullscreen',
    showSetlistManage && 'setlist-page--manage',
  ]
    .filter(Boolean)
    .join(' ');

  const renderFreeSongContent = () => {
    if (freeSongView === 'roster' && canManageCurrent) {
      return (
        <BuskingMemberRosterPanel
          activeSetList={activeSetList}
          canManage={canManageCurrent}
          variant="freeSong"
        />
      );
    }
    if (freeSongView === 'admin' && canManageCurrent) {
      return (
        <FreeSongAdminPanel
          activeSetList={activeSetList}
          submissionsState={submissionsState}
          userUid={user?.uid || ''}
        />
      );
    }
    if (freeSongView === 'order') {
      return (
        <FreeSongOrderPanel
          activeSetList={activeSetList}
          userNickname={user?.nickname || ''}
          canManage={canManageCurrent}
        />
      );
    }
    if (freeSongView === 'stats' && canManageCurrent) {
      return <FreeSongStatsPanel activeSetList={activeSetList} canManage={canManageCurrent} />;
    }
    return (
      <FreeSongPanel
        activeSetList={activeSetList}
        userNickname={user?.nickname || ''}
        userUid={user?.uid || ''}
        submissionsState={submissionsState}
      />
    );
  };

  const renderCategoryContent = () => {
    if (category === 'freeSong') {
      return renderFreeSongContent();
    }
    if (showSetlistManage) {
      return (
        <SetListManagerClassic
          setLists={setLists}
          activeSetList={activeSetList}
          onAfterSessionActivated={goToPerformView}
        />
      );
    }
    return <SetListCards songs={songs} activeSetList={activeSetList} fullscreen={isPerformFullscreen} />;
  };

  return (
    <div
      className={pageClassName}
      style={{
        ...pageBg,
        padding: isBuskingFullWidth ? 0 : '20px',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 25% 25%, rgba(255, 255, 255, 0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(255, 255, 255, 0.08) 0%, transparent 50%)',
          pointerEvents: 'none',
        }}
      />

      <div
        className={`setlist-page-inner${showSetlistManage ? ' setlist-page-inner--manage' : ''}`}
        style={{ position: 'relative', zIndex: 1 }}
      >
        {isPerformFullscreen ? (
          <div className="setlist-page-header--compact">
            <h1 style={{ color: 'white', fontWeight: 700, textShadow: '0 2px 4px rgba(0,0,0,0.2)', margin: 0, fontSize: 15 }}>
              셋리스트 · 무대 진행
            </h1>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => setCategory('freeSong')} style={tabBtnStyle}>
                ← 자유곡
              </button>
              {canManageCurrent && (
                <button type="button" onClick={() => setSetlistView('manage')} style={tabBtnStyle}>
                  편성
                </button>
              )}
              <button type="button" onClick={() => navigate('/')} style={tabBtnStyle}>
                홈
              </button>
            </div>
          </div>
        ) : (
          <BuskingNav
            category={category}
            onCategoryChange={setCategory}
            freeSongView={freeSongView}
            onFreeSongViewChange={setFreeSongView}
            setlistView={setlistView}
            onSetlistViewChange={setSetlistView}
            canManage={canManageCurrent}
            onHome={() => navigate('/')}
          />
        )}

        <div className={`busking-content busking-content--${category}`}>
          <BuskingSessionShell
            activeSetList={activeSetList}
            liveSessionsToday={liveSessionsToday}
            needsSessionPicker={needsSessionPicker && !awaitingVenue}
            awaitingVenue={awaitingVenue}
            bootstrapping={bootstrapping}
            bootstrapError={bootstrapError}
            user={sessionUser}
            canManageCurrent={canManageCurrent}
            setSelectedSessionId={setSelectedSessionId}
            onCreateSession={createSession}
            onRetryBootstrap={retryBootstrap}
          >
            {renderCategoryContent()}
          </BuskingSessionShell>
        </div>
      </div>
    </div>
  );
};

export default SetListClassic;
