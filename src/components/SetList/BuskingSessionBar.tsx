import React, { useState } from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import type { BuskingCategory } from './BuskingNav';
import type { SetListData } from './types';
import { formatBuskingSessionLabel } from './buskingSessionUtils';
import { canHostBuskingSession, canManageBuskingSession, type BuskingSessionUser } from './buskingSessionPermissions';

interface BuskingSessionBarProps {
  category: BuskingCategory;
  activeSetList: SetListData | null;
  liveSessionsToday: SetListData[];
  user: BuskingSessionUser | null;
  onSelectSession: (sessionId: string) => void;
  onOpenCreate: () => void;
  onEndSession?: () => void;
}

const BuskingSessionBar: React.FC<BuskingSessionBarProps> = ({
  category,
  activeSetList,
  liveSessionsToday,
  user,
  onSelectSession,
  onOpenCreate,
  onEndSession,
}) => {
  const [expanded, setExpanded] = useState(false);
  const canHost = canHostBuskingSession(user);
  const canManage = canManageBuskingSession(activeSetList, user);

  const sessionLabel = category === 'setlist' ? '참가 중인 셋리스트' : '참가 중인 버스킹';

  if (!activeSetList && liveSessionsToday.length === 0 && !canHost) return null;

  return (
    <div className="busking-session-bar">
      <div className="busking-session-bar__current">
        <MapPin size={16} className="busking-session-bar__icon" aria-hidden />
        <div className="busking-session-bar__info">
          <span className="busking-session-bar__label">{sessionLabel}</span>
          <span className="busking-session-bar__name">
            {activeSetList ? formatBuskingSessionLabel(activeSetList) : '세션을 선택해 주세요'}
          </span>
        </div>
        {(liveSessionsToday.length > 1 || canHost) && (
          <button
            type="button"
            className="busking-session-bar__toggle"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            변경
            <ChevronDown size={16} className={expanded ? 'busking-session-bar__chevron--open' : ''} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="busking-session-bar__panel">
          {liveSessionsToday.length > 0 ? (
            <ul className="busking-session-bar__list">
              {liveSessionsToday.map((session) => {
                const selected = session.id === activeSetList?.id;
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      className={`busking-session-bar__item${selected ? ' busking-session-bar__item--active' : ''}`}
                      onClick={() => {
                        if (session.id) onSelectSession(session.id);
                        setExpanded(false);
                      }}
                    >
                      {formatBuskingSessionLabel(session)}
                      {selected && <span className="busking-session-bar__check">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="busking-session-bar__empty">오늘 진행 중인 버스킹이 없습니다.</p>
          )}
          {canHost && (
            <button type="button" className="free-song-btn free-song-btn--submit busking-session-bar__create" onClick={() => { onOpenCreate(); setExpanded(false); }}>
              + 새 버스킹 열기
            </button>
          )}
          {canManage && onEndSession && activeSetList && (
            <button type="button" className="free-song-btn free-song-btn--cancel busking-session-bar__end" onClick={onEndSession}>
              이 버스킹 종료
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default BuskingSessionBar;
